"""
One-off migration: copy every table from CockroachDB into Cloud SQL (Postgres).

Both speak the Postgres wire protocol and db/schema.sql is valid on both, so
this is a straight data copy - no transformation. Primary keys (UUIDs) are
copied as-is so every foreign key keeps pointing at the right row.

Steps:
  1. Apply db/schema.sql to the target (idempotent CREATE ... IF NOT EXISTS).
  2. TRUNCATE the target tables - the schema's seed INSERT gives countries
     fresh random UUIDs, which would clash with the source's IDs.
  3. Copy each table in foreign-key order (parents before children): SELECT
     from the source, bulk-write into the target with Postgres COPY.
  4. Verify row counts match table by table.

Usage (target reached through the Cloud SQL Auth Proxy on localhost):
    SOURCE_DATABASE_URL=postgresql://...cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full \
    TARGET_DATABASE_URL=postgresql://app:...@127.0.0.1:5432/market_personalities \
    python gcp/migrate_cockroach_to_cloudsql.py
"""

from __future__ import annotations

import os
import pathlib
import sys

import psycopg

# Parents before children, so foreign keys are always satisfied on insert.
TABLES = [
    ("countries", "id, code, slug, name, flag_emoji, sort_order"),
    ("indicators", "id, country_id, category, slug, name, unit, source_path, created_at"),
    (
        "indicator_snapshots",
        "id, indicator_id, scraped_at, period_date, raw_period, "
        "last_value, previous_value, highest_value, lowest_value",
    ),
    ("country_traits", "id, country_id, trait, score, summary, model, generated_at"),
    ("country_personas", "id, country_id, archetype_title, narrative, model, generated_at"),
]

SCHEMA_PATH = pathlib.Path(__file__).resolve().parent.parent / "db" / "schema.sql"


def main() -> int:
    source_url = os.environ.get("SOURCE_DATABASE_URL")
    target_url = os.environ.get("TARGET_DATABASE_URL")
    if not source_url or not target_url:
        print("ERROR: set SOURCE_DATABASE_URL and TARGET_DATABASE_URL", file=sys.stderr)
        return 1

    with psycopg.connect(source_url) as src, psycopg.connect(target_url) as dst:
        print("Applying schema to target ...")
        dst.execute(SCHEMA_PATH.read_text())
        table_list = ", ".join(name for name, _ in TABLES)
        dst.execute(f"TRUNCATE {table_list} CASCADE")

        for name, columns in TABLES:
            # Read with a plain SELECT (CockroachDB's COPY TO support is
            # patchier than Postgres'), write with COPY FROM for speed.
            rows = src.execute(f"SELECT {columns} FROM {name}").fetchall()
            with dst.cursor() as d_cur, d_cur.copy(f"COPY {name} ({columns}) FROM STDIN") as into:
                for row in rows:
                    into.write_row(row)
            print(f"  copied {name}: {len(rows)} rows")
        dst.commit()

        print("Verifying row counts ...")
        ok = True
        for name, _ in TABLES:
            s = src.execute(f"SELECT count(*) FROM {name}").fetchone()[0]
            d = dst.execute(f"SELECT count(*) FROM {name}").fetchone()[0]
            status = "OK" if s == d else "MISMATCH"
            ok = ok and s == d
            print(f"  {name:22s} source={s:>7}  target={d:>7}  {status}")

    print("Migration complete." if ok else "Migration finished with MISMATCHES - investigate before cutover.")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
