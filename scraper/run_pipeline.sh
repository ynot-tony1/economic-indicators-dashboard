#!/bin/sh
# Nightly pipeline, run by the Cloud Run Job. Three stages in order; a failed
# stage stops the ones after it (set -e), except the personality step, which is
# allowed to fail without blocking the BigQuery load of the fresh scrape.
set -e

echo "== [1/3] Scrape indicators -> Cloud SQL =="
python scrape.py

echo "== [2/3] Generate market personalities -> Cloud SQL =="
python insights.py || echo "WARN: personality generation failed; continuing"

echo "== [3/3] Load Cloud SQL -> BigQuery =="
python export_bigquery.py
