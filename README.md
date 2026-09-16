# Economic Indicators Dashboard

Nightly-refreshed dashboard of economic indicators for the United States, United
Kingdom, Japan, France, Germany, Ireland, Kenya, South Africa, Italy, Zimbabwe,
Australia, and Singapore, sourced from
[TradingEconomics](https://tradingeconomics.com/indicators).

## Architecture

- **`web/`** — Next.js 16 (App Router, TypeScript, Tailwind, shadcn/ui) dashboard, deployed on Vercel. Reads directly from CockroachDB via Drizzle ORM.
- **`scraper/`** — Python scraper that parses the per-country indicator tables from TradingEconomics and writes snapshots to CockroachDB. Runs nightly via a GitHub Actions cron workflow (`.github/workflows/scrape.yml`), so scheduling/compute for the scrape lives on GitHub's infrastructure while the site itself lives on Vercel.
- **`db/schema.sql`** — canonical schema (`countries`, `indicators`, `indicator_snapshots`), applied once against your CockroachDB cluster.

Every nightly run inserts one new snapshot row per indicator, so the dashboard's
history charts build up over time starting from whenever the scraper first runs.

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
