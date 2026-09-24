"""
Load the operational Postgres (Cloud SQL) data into BigQuery, the analytical store.

Runs as the last step of the nightly pipeline, after scrape.py and insights.py.

Why two stores: Cloud SQL is the OLTP database the website reads from - small,
normalised, row-at-a-time lookups for one country's page. BigQuery is the OLAP
warehouse - columnar, built for scanning the whole history across every
country (e.g. "how has every country's inflation moved over 12 months"), and it
keeps history Postgres deliberately doesn't: Postgres only stores the *latest*
personality per country, BigQuery keeps every night's version.

Tables written (dataset BQ_DATASET, default "market_personalities"):
  countries, indicators, country_traits, country_personas
      -> full refresh each run (WRITE_TRUNCATE); small reference/current-state tables.
  indicator_snapshots
      -> full refresh, partitioned by DAY(scraped_at) and clustered by
         indicator_id so queries that filter by date/indicator scan less data.
  country_traits_history, country_personas_history
      -> one partition per run date (snapshot_date). Each run overwrites only
         today's partition (table$YYYYMMDD + WRITE_TRUNCATE), so re-running the
         job the same day is idempotent - no duplicate rows.

Usage:
    DATABASE_URL=... GCP_PROJECT=... python export_bigquery.py
Auth: Application Default Credentials (the Cloud Run Job's service account in
production; `gcloud auth application-default login` locally).
"""

from __future__ import annotations

import datetime as dt
import decimal
import os
import sys
import uuid

import psycopg
from google.cloud import bigquery

DATASET = os.environ.get("BQ_DATASET", "market_personalities")
LOCATION = os.environ.get("BQ_LOCATION", "europe-west2")

F = bigquery.SchemaField

TABLES: dict[str, dict] = {
    "countries": {
        "sql": "SELECT id, code, slug, name, flag_emoji, sort_order FROM countries",
        "schema": [
            F("id", "STRING", "REQUIRED"),
            F("code", "STRING", "REQUIRED"),
            F("slug", "STRING", "REQUIRED"),
            F("name", "STRING", "REQUIRED"),
            F("flag_emoji", "STRING"),
            F("sort_order", "INT64"),
        ],
    },
    "indicators": {
        "sql": "SELECT id, country_id, category, slug, name, unit, source_path, created_at FROM indicators",
        "schema": [
            F("id", "STRING", "REQUIRED"),
            F("country_id", "STRING", "REQUIRED"),
            F("category", "STRING", "REQUIRED"),
            F("slug", "STRING", "REQUIRED"),
            F("name", "STRING", "REQUIRED"),
            F("unit", "STRING"),
            F("source_path", "STRING"),
            F("created_at", "TIMESTAMP"),
        ],
    },
    "indicator_snapshots": {
        "sql": """
            SELECT id, indicator_id, scraped_at, period_date, raw_period,
                   last_value, previous_value, highest_value, lowest_value
            FROM indicator_snapshots
        """,
        "schema": [
            F("id", "STRING", "REQUIRED"),
            F("indicator_id", "STRING", "REQUIRED"),
            F("scraped_at", "TIMESTAMP", "REQUIRED"),
            F("period_date", "DATE"),
            F("raw_period", "STRING"),
            F("last_value", "BIGNUMERIC"),
            F("previous_value", "BIGNUMERIC"),
            F("highest_value", "BIGNUMERIC"),
            F("lowest_value", "BIGNUMERIC"),
        ],
        "partition_field": "scraped_at",
        "cluster_fields": ["indicator_id"],
    },
    "country_traits": {
        "sql": "SELECT id, country_id, trait, score, summary, model, generated_at FROM country_traits",
        "schema": [
            F("id", "STRING", "REQUIRED"),
            F("country_id", "STRING", "REQUIRED"),
            F("trait", "STRING", "REQUIRED"),
            F("score", "INT64", "REQUIRED"),
            F("summary", "STRING"),
            F("model", "STRING"),
            F("generated_at", "TIMESTAMP"),
        ],
        "history": True,
    },
    "country_personas": {
        "sql": "SELECT id, country_id, archetype_title, narrative, model, generated_at FROM country_personas",
        "schema": [
            F("id", "STRING", "REQUIRED"),
            F("country_id", "STRING", "REQUIRED"),
            F("archetype_title", "STRING"),
            F("narrative", "STRING"),
            F("model", "STRING"),
            F("generated_at", "TIMESTAMP"),
        ],
        "history": True,
    },
}


def to_json_value(value):
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, (dt.datetime, dt.date)):
        return value.isoformat()
    return value


def fetch_rows(conn, sql: str) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql)
        cols = [c.name for c in cur.description]
        return [{c: to_json_value(v) for c, v in zip(cols, row)} for row in cur.fetchall()]


def load(client: bigquery.Client, table_id: str, rows: list[dict], schema, *, partition_field=None,
         cluster_fields=None, partition_decorator: str | None = None) -> None:
    config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
    )
    if partition_field:
        config.time_partitioning = bigquery.TimePartitioning(
            type_=bigquery.TimePartitioningType.DAY, field=partition_field
        )
    if cluster_fields:
        config.clustering_fields = cluster_fields
    destination = f"{table_id}${partition_decorator}" if partition_decorator else table_id
    client.load_table_from_json(rows, destination, job_config=config).result()


def run() -> int:
    database_url = os.environ.get("DATABASE_URL")
    project = os.environ.get("GCP_PROJECT")
    if not database_url or not project:
        print("ERROR: DATABASE_URL and GCP_PROJECT must be set", file=sys.stderr)
        return 1

    client = bigquery.Client(project=project, location=LOCATION)
    dataset_ref = bigquery.Dataset(f"{project}.{DATASET}")
    dataset_ref.location = LOCATION
    client.create_dataset(dataset_ref, exists_ok=True)

    today = dt.datetime.now(dt.timezone.utc).date()

    with psycopg.connect(database_url) as conn:
        for name, spec in TABLES.items():
            rows = fetch_rows(conn, spec["sql"])
            table_id = f"{project}.{DATASET}.{name}"
            load(
                client,
                table_id,
                rows,
                spec["schema"],
                partition_field=spec.get("partition_field"),
                cluster_fields=spec.get("cluster_fields"),
            )
            print(f"  {name}: {len(rows)} rows -> {table_id}")

            if spec.get("history"):
                history_rows = [{**r, "snapshot_date": today.isoformat()} for r in rows]
                history_schema = [F("snapshot_date", "DATE", "REQUIRED"), *spec["schema"]]
                history_id = f"{project}.{DATASET}.{name}_history"
                load(
                    client,
                    history_id,
                    history_rows,
                    history_schema,
                    partition_field="snapshot_date",
                    partition_decorator=today.strftime("%Y%m%d"),
                )
                print(f"  {name}_history: {len(history_rows)} rows -> partition {today}")

    print("BigQuery export done.")
    return 0


if __name__ == "__main__":
    sys.exit(run())
