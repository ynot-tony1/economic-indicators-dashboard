# Market Personalities

Nightly-refreshed economic indicators and "market personalities" for 179
countries, sourced from [TradingEconomics](https://tradingeconomics.com/indicators).

Live on Google Cloud: https://mp-web-853132539656.europe-west2.run.app
(Original Vercel deployment: https://economic-indicator-comparison.vercel.app)

## Architecture (Google Cloud)

- **`web/`** — Next.js 16 (App Router, TypeScript, Tailwind, shadcn/ui) in a
  Docker container on **Cloud Run** (service `mp-web`). Reads from **Cloud SQL
  for PostgreSQL** via Drizzle ORM over the Cloud SQL connector's unix socket
  (IAM-authorised, no public IP allowlist). Featured pages are prerendered at
  build time and refreshed hourly (ISR).
- **`scraper/`** — the nightly pipeline, containerised as a **Cloud Run Job**
  (`mp-pipeline`) triggered by **Cloud Scheduler** at 00:00 Europe/London:
  1. `scrape.py` — scrape indicators → Cloud SQL
  2. `insights.py` — percentile-rank traits and build personas → Cloud SQL
  3. `export_bigquery.py` — load everything into **BigQuery** (dataset
     `market_personalities`): current tables full-refresh, snapshots partitioned
     by day and clustered by indicator, and a dated history partition of every
     night's personalities (which Cloud SQL deliberately doesn't keep).
- **`gcp/deploy.sh`** — scripted, idempotent infrastructure and deploys:
  APIs, Artifact Registry (with a keep-2 cleanup policy), one service account
  per workload with least-privilege roles, Cloud SQL, Secret Manager, Cloud
  Run service + job, Cloud Scheduler, and the cost guard.
- **`gcp/cost_guard/`** — GCP budgets only alert, so a £15 budget publishes to
  Pub/Sub, and this Cloud Run service stops the Cloud SQL instance (the only
  paid component) once spend reaches it.
- **`gcp/migrate_cockroach_to_cloudsql.py`** — the one-off migration from the
  original CockroachDB database (row counts verified table by table).
- **`db/schema.sql`** — canonical schema, valid on both Postgres and CockroachDB.

The original Vercel + CockroachDB + GitHub Actions deployment still runs in
parallel (`.github/workflows/scrape.yml`), so both stay current.

See `PROGRESS.md` for a running implementation log.

## One-time setup

### 1. Create a CockroachDB cluster

Create a free Serverless cluster at [cockroachlabs.cloud](https://cockroachlabs.cloud),
then grab the connection string from the cluster's **Connect** panel. It looks like:

```
postgresql://<user>:<password>@<host>:26257/defaultdb?sslmode=verify-full&options=--cluster%3D<cluster-name>
```

### 2. Apply the schema

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

This creates the tables and seeds the twelve tracked countries (US, GB, JP, FR, DE, IE, KE, ZA, IT, ZW, AU, SG).

### 3. Set `DATABASE_URL` in three places

| Where | Purpose | How |
|---|---|---|
| `web/.env.local` | local dev | copy `web/.env.example` to `web/.env.local` and paste the string |
| GitHub repo secret `DATABASE_URL` | nightly scraper (GitHub Actions) | repo **Settings → Secrets and variables → Actions → New repository secret** |
| Vercel project env var `DATABASE_URL` | production site | project **Settings → Environment Variables** |

### 4. Run the scraper once to seed data

```bash
cd scraper
pip install -r requirements.txt
export DATABASE_URL=postgresql://...
python scrape.py
```

Use `python scrape.py --dry-run` to parse and print without touching the database.

## Local development (web)

```bash
cd web
npm install
npm run dev
```

Without `DATABASE_URL` set, pages render a "Database not configured" state instead of failing.

## Scheduling

`.github/workflows/scrape.yml` runs at midnight **Europe/London** time year-round
(it schedules both the BST and GMT UTC-equivalents and skips whichever firing
doesn't land on local midnight, so it self-corrects across the clock change).
Trigger it manually anytime from the Actions tab (`workflow_dispatch`).

## Deploying

Vercel project root directory: `web/`. Framework preset: Next.js. Set the
`DATABASE_URL` environment variable in the Vercel project before deploying so
build-time static generation can read real data.

## Scraping etiquette

The scraper identifies itself with a descriptive User-Agent, runs once nightly,
and adds a delay between the three country page requests. Review TradingEconomics'
terms of use if you plan to scrape more frequently or at larger scale.
