"""
Nightly scraper for the economic indicators dashboard.

Fetches the per-country indicator tables from tradingeconomics.com for the
countries seeded in the `countries` table, and stores one snapshot row per
indicator per run in `indicator_snapshots`. Run nightly via the GitHub
Actions workflow at .github/workflows/scrape.yml.

Usage:
    DATABASE_URL=postgresql://... python scrape.py
    python scrape.py --dry-run          # parse only, print counts, no DB writes
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import psycopg
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://tradingeconomics.com"
USER_AGENT = (
    "economic-indicators-dashboard/1.0 "
    "(personal nightly data refresh; contact: tonycowan56@gmail.com)"
)
REQUEST_DELAY_SECONDS = 3
CATEGORY_SKIP = {"overview"}  # duplicates rows already covered by other tabs

COUNTRIES = [
    {"code": "US", "slug": "united-states"},
    {"code": "GB", "slug": "united-kingdom"},
    {"code": "JP", "slug": "japan"},
]

MONTH_ABBR = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def fetch_page(slug: str) -> str:
    url = f"{BASE_URL}/{slug}/indicators"
    resp = requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.text


def parse_value(cell) -> Decimal | None:
    text = cell.get_text(strip=True).replace(",", "")
    if not text or text.upper() == "NA":
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def parse_period(text: str):
    text = text.strip()
    m = re.match(r"^([A-Za-z]{3})/(\d{2,4})$", text)
    if m:
        month = MONTH_ABBR.get(m.group(1).lower())
        year = int(m.group(2))
        if year < 100:
            year += 2000
        if month:
            return f"{year:04d}-{month:02d}-01"
    m = re.match(r"^Q([1-4])/(\d{2,4})$", text)
    if m:
        quarter = int(m.group(1))
        year = int(m.group(2))
        if year < 100:
            year += 2000
        month = quarter * 3 - 2
        return f"{year:04d}-{month:02d}-01"
    m = re.match(r"^(\d{4})$", text)
    if m:
        return f"{int(m.group(1)):04d}-01-01"
    return None


def parse_country_page(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    rows: list[dict] = []

    for panel in soup.find_all("div", attrs={"role": "tabpanel"}):
        category = (panel.get("id") or "").strip().lower()
        if not category or category in CATEGORY_SKIP:
            continue

        table = panel.find("table")
        if table is None:
            continue
        tbody = table.find("tbody")
        if tbody is None:
            continue

        for tr in tbody.find_all("tr", recursive=False):
            cells = tr.find_all("td", recursive=False)
            if len(cells) < 7:
                continue
            link = cells[0].find("a")
            if link is None or not link.get("href"):
                continue

            name = link.get_text(strip=True)
            href = link["href"].strip()
            slug = href.rstrip("/").split("/")[-1]
            if not slug or not name:
                continue

            raw_period = cells[6].get_text(strip=True)
            rows.append(
                {
                    "category": category,
                    "slug": slug,
                    "name": name,
                    "source_path": href,
                    "unit": cells[5].get_text(strip=True) or None,
                    "last_value": parse_value(cells[1]),
                    "previous_value": parse_value(cells[2]),
                    "highest_value": parse_value(cells[3]),
                    "lowest_value": parse_value(cells[4]),
                    "raw_period": raw_period or None,
                    "period_date": parse_period(raw_period) if raw_period else None,
                }
            )
    return rows


def upsert_indicator(cur, country_id: str, row: dict) -> str:
    cur.execute(
        """
        INSERT INTO indicators (country_id, category, slug, name, unit, source_path)
        VALUES (%(country_id)s, %(category)s, %(slug)s, %(name)s, %(unit)s, %(source_path)s)
        ON CONFLICT (country_id, slug) DO UPDATE SET
            category = EXCLUDED.category,
            name = EXCLUDED.name,
            unit = EXCLUDED.unit,
            source_path = EXCLUDED.source_path
        RETURNING id
        """,
        {**row, "country_id": country_id},
    )
    return cur.fetchone()[0]


def insert_snapshot(cur, indicator_id: str, scraped_at: datetime, row: dict) -> None:
    cur.execute(
        """
        INSERT INTO indicator_snapshots
            (indicator_id, scraped_at, period_date, raw_period,
             last_value, previous_value, highest_value, lowest_value)
        VALUES
            (%(indicator_id)s, %(scraped_at)s, %(period_date)s, %(raw_period)s,
             %(last_value)s, %(previous_value)s, %(highest_value)s, %(lowest_value)s)
        ON CONFLICT (indicator_id, scraped_at) DO UPDATE SET
            period_date = EXCLUDED.period_date,
            raw_period = EXCLUDED.raw_period,
            last_value = EXCLUDED.last_value,
            previous_value = EXCLUDED.previous_value,
            highest_value = EXCLUDED.highest_value,
            lowest_value = EXCLUDED.lowest_value
        """,
        {
            **row,
            "indicator_id": indicator_id,
            "scraped_at": scraped_at,
        },
    )


def run(dry_run: bool = False) -> int:
    run_started_at = datetime.now(timezone.utc)
    conn = None
    country_ids: dict[str, str] = {}

    if not dry_run:
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            print("ERROR: DATABASE_URL is not set", file=sys.stderr)
            return 1
        conn = psycopg.connect(database_url, autocommit=False)
        with conn.cursor() as cur:
            cur.execute("SELECT slug, id FROM countries")
            country_ids = {slug: str(cid) for slug, cid in cur.fetchall()}

    total_rows = 0
    for i, country in enumerate(COUNTRIES):
        if i > 0:
            time.sleep(REQUEST_DELAY_SECONDS)

        print(f"Fetching {country['slug']} ...")
        html = fetch_page(country["slug"])
        rows = parse_country_page(html)
        print(f"  parsed {len(rows)} indicators")
        total_rows += len(rows)

        if dry_run:
            for row in rows[:5]:
                print(f"  sample: [{row['category']}] {row['name']} = "
                      f"{row['last_value']} {row['unit']} ({row['raw_period']})")
            continue

        country_id = country_ids.get(country["slug"])
        if not country_id:
            print(f"  WARNING: country '{country['slug']}' not seeded in DB, skipping")
            continue

        with conn.cursor() as cur:
            for row in rows:
                indicator_id = upsert_indicator(cur, country_id, row)
                insert_snapshot(cur, indicator_id, run_started_at, row)
        conn.commit()
        print(f"  wrote {len(rows)} snapshots for {country['slug']}")

    if conn:
        conn.close()

    print(f"Done. {total_rows} indicator rows processed across {len(COUNTRIES)} countries.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="parse only, skip DB writes")
    args = parser.parse_args()
    sys.exit(run(dry_run=args.dry_run))
