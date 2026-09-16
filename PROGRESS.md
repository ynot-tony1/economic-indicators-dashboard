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
- [x] git init at repo root + first commit (no Claude co-author trailer; author is `ynot-tony1 <tonycowan56@gmail.com>`)
- [x] GitHub repo created: https://github.com/ynot-tony1/economic-indicators-dashboard (private) + pushed
- [x] Vercel project linked: `tony-f5c4/economic-indicators-dashboard`, root directory `web/`; `vercel git connect` wired for push-to-deploy (needed a CLI upgrade — `npm i -g vercel@latest` — the old 59.1.4 CLI couldn't find the git repo from the `web/` subdirectory, 59.19.0 fixed it)
- [x] CockroachDB `DATABASE_URL` wired into: `web/.env.local` (local, gitignored), GitHub Actions repo secret, Vercel env vars (production + preview + development)
  - **Safety note**: the user initially pasted the real connection string into `web/.env.example` (git-tracked). Caught before it was committed with real values — reverted that file to a placeholder and moved the real string to `.env.local` instead. Nothing with real credentials was ever pushed.
  - The CockroachDB console's displayed connection string wrapped the password in literal `<...>` — those angle brackets are a display artifact, not part of the password; had to strip them for the URI to parse/connect.
- [x] Ran `db/schema.sql` against the live cluster (via a one-off `pg` script) — tables created, 3 countries seeded
- [x] First scraper run (real, not dry-run) — 396 US / 193 UK / 168 Japan indicators written as the first snapshot for each
- [x] Verified locally with `next dev` + curl against real data (all 3 country pages + a detail page), no errors in dev log
- [x] Deployed to Vercel production: **https://economic-indicators-dashboard.vercel.app** — confirmed publicly reachable, rendering real data, no auth wall

## Visual polish pass (2026-09-16)

- Sticky blurred header with a small "EI" mark; sticky per-category quick-nav (pill links with counts) under the country header — needed since the US page alone has 396 indicators across 12 categories to scroll through
- `RangeGauge` component: small marker-on-track showing where "Last" sits between TE's own Lowest/Highest, used on both cards and the detail page
- Country identity carried as a consistent accent color (the validated per-country palette from earlier) onto card top-borders, the detail page's left rule, and the category badge — not just chart lines
- Loading skeletons for both route segments (`loading.tsx`)
- Ran the `frontend-design` skill's audit against generic "AI-generated" chrome tells and fixed what it flagged: removed middle-dot-joined meta strings (replaced with either a real hairline divider or a colored category badge) and a unicode arrow (↗) appended to link text (replaced with the same `ExternalLink` icon used elsewhere, for consistency)
- Verified with `next build` (clean) and `next dev` + curl against real seeded data on all 3 country pages + a detail page — no runtime errors
- Redeployed to production: https://economic-indicators-dashboard.vercel.app

## Dark theme + centering/font fix (2026-09-16, after user screenshot feedback)

User sent a screenshot showing the live site: too bright, not centered, generic-looking font. Root causes found and fixed:

- **Dark mode was never actually active.** `.dark { ... }` variables existed in `globals.css` but nothing ever added a `dark` class anywhere — the site always rendered light regardless of OS setting, despite PROGRESS.md previously (incorrectly) claiming it followed system preference. Fixed by hardcoding `dark` on `<html>` in `layout.tsx` — this is a permanently-dark dashboard now (matches the Bloomberg/TradingView convention for financial data tools), no light/dark toggle.
- **Real centering bug**, not just taste: `CategoryQuickNav` used a `-mx-6` negative-margin "bleed" trick designed to cancel a `max-w-6xl px-6` parent's padding — but it had been placed in a plain unconstrained `<div>` outside that container, so it bled to the full viewport edge (visibly cut off at the left in the screenshot) while the header/cards above/below stayed correctly centered at max-w-6xl. Fixed by nesting the whole `/[country]` page in one consistent `mx-auto max-w-6xl px-6` wrapper and removing the bleed hack entirely.
- **Fonts were silently falling back to a generic system font.** The Tailwind `@theme inline` block expected a CSS variable literally named `--font-sans`, but `layout.tsx` was defining Geist under the name `--font-geist-sans` — a mismatch, so the custom font was never actually applied via the `font-sans` utility. Replaced Geist/Geist Mono with **Space Grotesk** (UI/headings) and **JetBrains Mono** (numeric/tabular data — a deliberate choice for a data dashboard, not decorative: financial dashboards conventionally use monospace/tabular figures for scannable number alignment), and fixed the variable naming so they actually apply.
- Toned down the per-card country-accent treatment (was a bright 2px border repeated on every single card, reads as loud when there are dozens per category) to a subtle hover-only border tint via `color-mix`; kept the accent as a deliberate single touch on the range-gauge dot and the detail page's side rule instead.
- Rebuilt, verified via `next build` + `next start` that `<html>` carries the `dark` class and the compiled CSS resolves `--background:#0a0a0a` / `--card:#171717`, and that no `-mx-6` bleed remains anywhere in the rendered output.
- Redeployed to production.

## Domain alias (2026-09-16)

- Requested `global-economic-indicators.vercel.app` — unavailable (`.vercel.app` subdomains are global/first-come-first-served across all Vercel users, not just this project). User picked `economic-indicator-comparison.vercel.app` instead; assigned via `vercel alias set`.
- Discovered the project's Deployment Protection (`ssoProtection.deploymentType: "all_except_custom_domains"`) only exempted the original auto-generated production domain from the Vercel SSO login wall — any additional alias, even another `.vercel.app` one, was gated behind Vercel auth. Confirmed with the user they wanted it fully public (consistent with how the site had worked so far) and disabled SSO protection project-wide: `vercel project protection disable economic-indicators-dashboard --sso`.
- Both domains now serve the live dashboard with no auth wall:
  - https://economic-indicators-dashboard.vercel.app
  - https://economic-indicator-comparison.vercel.app

## Remaining / future work

- Nothing blocking — the site is live and the nightly scrape is scheduled. First automatic nightly run will happen at the next midnight Europe/London.
- No dark-mode toggle UI built (not requested) — dark mode follows OS `prefers-color-scheme` automatically via the existing shadcn CSS variable setup.
- `next.config.ts` does not have Cache Components (`cacheComponents: true`) enabled — using the standard/previous caching model, so pages use plain `async` Server Components with `export const revalidate` (1hr) for ISR rather than `use cache` + Suspense-wrapped params.
- Dashboard cards show TE's own Last/Previous/Highest/Lowest rather than a sparkline (would need N+1 history queries with little payoff on day one). Once a few weeks of nightly history accumulate, revisit whether a lightweight sparkline on cards is worth adding.
- Only one snapshot exists per indicator right now, so every detail-page chart currently shows the "first snapshot" single-point state — this is expected and will fill in as the nightly job runs.
