#!/usr/bin/env bash
# Scripted GCP infrastructure + deploy for Market Personalities.
#
#   ./gcp/deploy.sh infra      APIs, Artifact Registry, service accounts + IAM,
#                              Cloud SQL instance/db/user, Secret Manager secrets
#   ./gcp/deploy.sh migrate    copy CockroachDB -> Cloud SQL (needs SOURCE_DATABASE_URL)
#   ./gcp/deploy.sh build      build + push both images (web build reads Cloud SQL via the Auth Proxy)
#   ./gcp/deploy.sh deploy     deploy web (Cloud Run service) + pipeline (Cloud Run Job)
#   ./gcp/deploy.sh schedule   Cloud Scheduler trigger for the nightly pipeline
#   ./gcp/deploy.sh run-job    run the pipeline now (scrape -> personalities -> BigQuery)
#   ./gcp/deploy.sh all        infra, build, deploy, schedule (migrate is run separately, once)
#
# Every step is safe to re-run: resources are created only if missing.
# Required: PROJECT_ID. Optional: REGION (default europe-west2 / London).
#
# DB_MODE picks where the operational database lives:
#   cockroach (default) - keep the existing CockroachDB Serverless database (free
#                         tier); needs COCKROACH_DATABASE_URL on first `infra`.
#                         Everything else runs on GCP free-tier services.
#   cloudsql            - provision Cloud SQL for Postgres (~GBP 7-8/month, the
#                         only paid component) and run `migrate` to move the data.
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-europe-west2}"
DB_MODE="${DB_MODE:-cockroach}"
INSTANCE="${INSTANCE:-market-personalities-db}"
DB_NAME="market_personalities"
DB_USER="app"
REPO="market-personalities"
WEB_SERVICE="mp-web"
PIPELINE_JOB="mp-pipeline"
SCHEDULER_JOB="mp-nightly"
PROXY_PORT=5433
PROXY_VERSION="v2.25.4"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GCLOUD="${GCLOUD:-gcloud}"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"
CONN_NAME="${PROJECT_ID}:${REGION}:${INSTANCE}"
SA_WEB="mp-web@${PROJECT_ID}.iam.gserviceaccount.com"
SA_PIPELINE="mp-pipeline@${PROJECT_ID}.iam.gserviceaccount.com"
SA_SCHEDULER="mp-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"

g() { "$GCLOUD" --project "$PROJECT_ID" --quiet "$@"; }
log() { printf '\n== %s ==\n' "$*"; }

db_password() { g secrets versions access latest --secret db-password; }

ensure_sa() { # name, display
  g iam service-accounts describe "$1@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1 ||
    g iam service-accounts create "$1" --display-name "$2"
}

grant() { # member, role
  g projects add-iam-policy-binding "$PROJECT_ID" --member "$1" --role "$2" --condition None >/dev/null
}

ensure_secret() { # name, value
  if g secrets describe "$1" >/dev/null 2>&1; then
    printf '%s' "$2" | g secrets versions add "$1" --data-file=-
  else
    printf '%s' "$2" | g secrets create "$1" --replication-policy automatic --data-file=-
  fi
}

infra() {
  log "Enabling APIs"
  g services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
    cloudscheduler.googleapis.com secretmanager.googleapis.com bigquery.googleapis.com iam.googleapis.com

  log "Artifact Registry"
  g artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 ||
    g artifacts repositories create "$REPO" --repository-format docker --location "$REGION"

  log "Service accounts (one per workload, least privilege)"
  ensure_sa mp-web "Market Personalities web (Cloud Run service)"
  ensure_sa mp-pipeline "Market Personalities nightly pipeline (Cloud Run Job)"
  ensure_sa mp-scheduler "Market Personalities scheduler trigger"
  local roles=(roles/secretmanager.secretAccessor)
  [ "$DB_MODE" = cloudsql ] && roles+=(roles/cloudsql.client)
  for role in "${roles[@]}"; do
    grant "serviceAccount:${SA_WEB}" "$role"
    grant "serviceAccount:${SA_PIPELINE}" "$role"
  done
  grant "serviceAccount:${SA_PIPELINE}" roles/bigquery.dataEditor
  grant "serviceAccount:${SA_PIPELINE}" roles/bigquery.jobUser

  log "Artifact Registry cleanup: keep only the 2 newest images per package"
  local policy
  policy="$(mktemp)"
  cat >"$policy" <<'JSON'
[
  {"name": "keep-newest-2", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 2}},
  {"name": "delete-rest", "action": {"type": "Delete"}, "condition": {"tagState": "any"}}
]
JSON
  g artifacts repositories set-cleanup-policies "$REPO" --location "$REGION" --policy "$policy" --no-dry-run >/dev/null
  rm -f "$policy"

  if [ "$DB_MODE" = cockroach ]; then
    log "Database: CockroachDB Serverless (no Cloud SQL provisioned)"
    if ! g secrets describe database-url >/dev/null 2>&1; then
      : "${COCKROACH_DATABASE_URL:?set COCKROACH_DATABASE_URL for the first infra run}"
      ensure_secret database-url "$COCKROACH_DATABASE_URL"
    fi
    return
  fi

  log "Cloud SQL (Postgres 16, smallest shared-core tier)"
  if ! g sql instances describe "$INSTANCE" >/dev/null 2>&1; then
    g sql instances create "$INSTANCE" \
      --database-version POSTGRES_16 --edition ENTERPRISE --tier db-f1-micro \
      --region "$REGION" --storage-type SSD --storage-size 10 \
      --backup-start-time 03:00
  fi
  g sql databases describe "$DB_NAME" --instance "$INSTANCE" >/dev/null 2>&1 ||
    g sql databases create "$DB_NAME" --instance "$INSTANCE"

  if ! g secrets describe db-password >/dev/null 2>&1; then
    local pw
    pw="$(openssl rand -hex 24)"
    g sql users create "$DB_USER" --instance "$INSTANCE" --password "$pw"
    ensure_secret db-password "$pw"
    # Cloud Run mounts Cloud SQL as a unix socket at /cloudsql/<connection name>;
    # this URL form works for both node-postgres and libpq/psycopg.
    ensure_secret database-url "postgresql://${DB_USER}:${pw}@localhost/${DB_NAME}?host=/cloudsql/${CONN_NAME}"
  fi
  echo "Cloud SQL connection name: ${CONN_NAME}"
}

# Runs the Cloud SQL Auth Proxy on localhost for the duration of a command, so
# local tools (migration script, web build) reach Cloud SQL over an
# IAM-authenticated, encrypted tunnel - no public IP allowlisting needed.
with_proxy() {
  local bin="${ROOT}/gcp/.bin/cloud-sql-proxy"
  if [ ! -x "$bin" ]; then
    mkdir -p "$(dirname "$bin")"
    curl -sSLo "$bin" \
      "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/${PROXY_VERSION}/cloud-sql-proxy.linux.amd64"
    chmod +x "$bin"
  fi
  local proxy_log
  proxy_log="$(mktemp)"
  "$bin" --port "$PROXY_PORT" "$CONN_NAME" >"$proxy_log" 2>&1 &
  local proxy_pid=$!
  for _ in $(seq 1 30); do
    grep -q "ready for new connections" "$proxy_log" && break
    sleep 1
  done
  local status=0
  "$@" || status=$?
  kill "$proxy_pid" 2>/dev/null || true
  wait "$proxy_pid" 2>/dev/null || true
  rm -f "$proxy_log"
  return "$status"
}

build_db_url() { g secrets versions access latest --secret database-url; }

local_db_url() { echo "postgresql://${DB_USER}:$(db_password)@127.0.0.1:${PROXY_PORT}/${DB_NAME}"; }

migrate() {
  : "${SOURCE_DATABASE_URL:?set SOURCE_DATABASE_URL to the CockroachDB connection string}"
  log "Migrating CockroachDB -> Cloud SQL"
  _do_migrate() {
    TARGET_DATABASE_URL="$(local_db_url)" "${ROOT}/scraper/.venv/bin/python" \
      "${ROOT}/gcp/migrate_cockroach_to_cloudsql.py"
  }
  with_proxy _do_migrate
}

build() {
  log "Building + pushing images"
  g auth configure-docker "${REGION}-docker.pkg.dev" >/dev/null
  local tag
  tag="$(git -C "$ROOT" rev-parse --short HEAD)"

  docker build -t "${IMAGE_BASE}/pipeline:${tag}" -t "${IMAGE_BASE}/pipeline:latest" "${ROOT}/scraper"

  _build_web() {
    local secret_file
    secret_file="$(mktemp)"
    if [ "$DB_MODE" = cloudsql ]; then local_db_url >"$secret_file"; else build_db_url >"$secret_file"; fi
    DOCKER_BUILDKIT=1 docker build --network host \
      --secret "id=database_url,src=${secret_file}" \
      -t "${IMAGE_BASE}/web:${tag}" -t "${IMAGE_BASE}/web:latest" "${ROOT}/web"
    rm -f "$secret_file"
  }
  if [ "$DB_MODE" = cloudsql ]; then with_proxy _build_web; else _build_web; fi

  docker push --all-tags "${IMAGE_BASE}/pipeline"
  docker push --all-tags "${IMAGE_BASE}/web"
  echo "$tag" >"${ROOT}/gcp/.last-tag"
}

deploy() {
  local tag
  tag="$(cat "${ROOT}/gcp/.last-tag" 2>/dev/null || echo latest)"

  local web_sql=() job_sql=()
  if [ "$DB_MODE" = cloudsql ]; then
    web_sql=(--add-cloudsql-instances "$CONN_NAME")
    job_sql=(--set-cloudsql-instances "$CONN_NAME")
  fi

  log "Deploying web -> Cloud Run service ${WEB_SERVICE}"
  g run deploy "$WEB_SERVICE" --region "$REGION" \
    --image "${IMAGE_BASE}/web:${tag}" \
    --service-account "$SA_WEB" \
    "${web_sql[@]}" \
    --set-secrets DATABASE_URL=database-url:latest \
    --allow-unauthenticated \
    --cpu 1 --memory 512Mi --min-instances 0 --max-instances 3 --concurrency 80

  log "Deploying pipeline -> Cloud Run Job ${PIPELINE_JOB}"
  g run jobs deploy "$PIPELINE_JOB" --region "$REGION" \
    --image "${IMAGE_BASE}/pipeline:${tag}" \
    --service-account "$SA_PIPELINE" \
    "${job_sql[@]}" \
    --set-secrets DATABASE_URL=database-url:latest \
    --set-env-vars "GCP_PROJECT=${PROJECT_ID},BQ_LOCATION=${REGION}" \
    --cpu 1 --memory 1Gi --task-timeout 3600 --max-retries 1

  g run services describe "$WEB_SERVICE" --region "$REGION" --format 'value(status.url)'
}

schedule() {
  log "Cloud Scheduler: nightly at 00:00 Europe/London"
  # Scheduler may only invoke this one job, via its own dedicated identity.
  g run jobs add-iam-policy-binding "$PIPELINE_JOB" --region "$REGION" \
    --member "serviceAccount:${SA_SCHEDULER}" --role roles/run.invoker >/dev/null
  local uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${PIPELINE_JOB}:run"
  local args=(--location "$REGION" --schedule "0 0 * * *" --time-zone "Europe/London"
    --uri "$uri" --http-method POST --oauth-service-account-email "$SA_SCHEDULER")
  if g scheduler jobs describe "$SCHEDULER_JOB" --location "$REGION" >/dev/null 2>&1; then
    g scheduler jobs update http "$SCHEDULER_JOB" "${args[@]}"
  else
    g scheduler jobs create http "$SCHEDULER_JOB" "${args[@]}"
  fi
}

run_job() {
  log "Running pipeline now"
  g run jobs execute "$PIPELINE_JOB" --region "$REGION" --wait
}

case "${1:-}" in
  infra) infra ;;
  migrate) migrate ;;
  build) build ;;
  deploy) deploy ;;
  schedule) schedule ;;
  run-job) run_job ;;
  all) infra && build && deploy && schedule ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
