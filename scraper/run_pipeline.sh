#!/bin/sh
# Nightly pipeline, run by the Cloud Run Job. Stages run in order; a failed
# stage stops the ones after it (set -e), except the personality step, which is
# allowed to fail without blocking the BigQuery load of the fresh scrape. The
# final site refresh never fails the run.
set -e

echo "== [1/4] Scrape indicators -> Cloud SQL =="
python scrape.py

echo "== [2/4] Generate market personalities -> Cloud SQL =="
python insights.py || echo "WARN: personality generation failed; continuing"

echo "== [3/4] Load Cloud SQL -> BigQuery =="
python export_bigquery.py

echo "== [4/4] Refresh the website's cached pages =="
python revalidate_site.py
