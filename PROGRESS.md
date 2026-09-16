# Economic Indicators Dashboard — Implementation Log

Running log of what's been built, decisions made, and what's left. Updated at
each major step so work can resume from here if a session ends early.

## Architecture decisions

- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind v4, shadcn/ui) in `web/`, deployed on Vercel.
- **Database**: CockroachDB (Postgres wire-compatible), accessed via Drizzle ORM (`drizzle-orm/node-postgres`) from the web app, and `psycopg` from the Python scraper.
- **Scraper**: Python (`scraper/scrape.py`), scrapes the per-country indicator tables from `tradingeconomics.com/{country-slug}/indicators` (not the global `/indicators` overview page — the per-country pages have the full indicator set with Last/Previous/Highest/Lowest/Unit/Date per category tab).
- **Scheduling**: GitHub Actions cron workflow (`.github/workflows/scrape.yml`), `0 0 * * *` (midnight UTC), runs the scraper against CockroachDB using a `DATABASE_URL` repo secret. This satisfies "GitHub's cloud infrastructure" for the nightly job while Vercel hosts the web app itself.
- **Data model**: each nightly run inserts one `indicator_snapshots` row per indicator (own accumulated time series over time), plus upserts the `indicators` row (metadata). Countries are pre-seeded (US/GB/JP) in `db/schema.sql`.
- **No commit/PR/repo metadata should ever reference Claude or attribute Claude as co-author/contributor** — explicit user instruction. All git commits use the user's own identity, no `Co-Authored-By` trailers.

## Site structure (planned)

- `/` → redirects to `/united-states`
- `/[country]` → dashboard: country switcher (US/UK/Japan), indicators grouped by category (GDP, Labour, Prices, …), each shown as a card with Last/Previous/range + delta badge (colors from the validated dataviz palette — blue=US, orange=Japan, violet=UK; green/red reserved for status/delta only, never reused as a country color)
- `/[country]/[indicator]` → detail page with full accumulated history line chart (custom SVG component, not a charting library — built to the dataviz skill's mark spec: 2px lines, hover crosshair+tooltip, accessible)

## Page-scraping structure (confirmed by fetching live HTML, 2026-09-16)

Per-country pages (e.g. `tradingeconomics.com/united-states/indicators`) render
server-side HTML (no JS needed to scrape). Structure:
- `<div role="tabpanel" id="{category}">` per category (gdp, labour, prices, money, trade, government, business, consumer, housing, energy, health, …) — skip `id="overview"`, it duplicates rows from the other tabs.
- Inside each: `<table class="table table-hover">` → `<tbody>` rows, 7 `<td>`s: [0] indicator name + link (slug = last path segment of href), [1] Last, [2] Previous, [3] Highest, [4] Lowest, [5] Unit, [6] period text like `Aug/26`.

## Status

- [x] Repo scaffolded: `web/` (Next.js 16 + TS + Tailwind v4 + shadcn/ui, Base UI/Nova preset), `scraper/`, `db/`, `.github/workflows/`
- [x] Investigated live TradingEconomics HTML structure to design the scraper correctly
- [x] `db/schema.sql` written (countries, indicators, indicator_snapshots) — run manually once against the CockroachDB cluster
- [x] `scraper/scrape.py` written (BeautifulSoup + psycopg3, `--dry-run` flag, polite delay + descriptive UA between requests)
- [x] Drizzle schema (`web/src/db/schema.ts`), db client (`web/src/db/client.ts`, gracefully null if `DATABASE_URL` unset), queries (`web/src/db/queries.ts`)
- [x] dataviz palette chosen & validated (`node scripts/validate_palette.js`): US=blue `#2a78d6`/`#3987e5`, Japan=orange `#eb6834`/`#d95926`, UK=violet `#4a3aa7`/`#9085e9` — all pairwise CVD/contrast checks pass in light+dark
- [x] `web/src/lib/colors.ts`, `categories.ts`, `format.ts`
- [x] `LineChart` component (custom SVG, hover crosshair+tooltip, handles 0/1/N point states) — decided against a `Sparkline` on dashboard cards (would need N+1 history queries per page load for little payoff on day one when history is thin); cards show TE's own Last/Previous/Highest/Lowest instead, full history lives on the detail page
- [x] Dashboard pages (`/[country]`, `/[country]/[indicator]`) + header/nav (`CountryNav`, `IndicatorCard`, `DeltaBadge`, `DbNotConfigured`/`EmptyState`)
- [x] `npm run build` passes clean (no DATABASE_URL set locally — pages correctly fall back to the "not configured" state); spot-checked with `next dev` + curl
- [x] GitHub Actions workflow file — schedules both BST/GMT UTC-equivalents of midnight Europe/London and skips whichever firing isn't actually local midnight, so it self-corrects across the DST clock change (user explicitly asked for London local midnight, not fixed UTC)
- [x] README with setup instructions
- [x] `.gitignore` (root, for scraper/env), `.env.example` (web + scraper)
- [ ] git init at repo root + first commit (no Claude co-author trailer)
- [ ] GitHub repo created via `gh repo create` + push
- [ ] Vercel project linked (root directory `web/`)
- [ ] CockroachDB `DATABASE_URL` wired into: `web/.env.local` (local), GitHub Actions secret (scraper), Vercel env vars (production) — **waiting on user to paste the connection string**
- [ ] Run `db/schema.sql` against the live cluster
- [ ] First scraper run (manual, to seed data) + verify dashboard renders real data
- [ ] Deploy to Vercel

## Open items / things to revisit

- No dark-mode toggle UI built (not requested) — dark mode follows OS `prefers-color-scheme` automatically via the existing shadcn CSS variable setup.
- `next.config.ts` does not have Cache Components (`cacheComponents: true`) enabled — using the standard/previous caching model, so pages use plain `async` Server Components with `export const revalidate` for ISR rather than `use cache` + Suspense-wrapped params.
