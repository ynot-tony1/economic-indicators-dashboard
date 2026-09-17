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

## Added 5 more countries (2026-09-16)

User asked to add France, Germany, Republic of Ireland, Kenya, and South Africa (site now tracks 8 countries total).

- Verified TradingEconomics slugs before wiring anything up: `france`, `germany`, `kenya`, `south-africa` are straightforward. **Ireland is `ireland`, not `republic-of-ireland`** — the latter 200s but returns a near-empty 2KB page; `/ireland/indicators` is TE's real, populated page (its own page title is "Ireland Indicators..."). Using `ireland` as the slug, "Ireland" as the display name.
- Extended in every place a country is registered: `db/schema.sql` seed data, `scraper/scrape.py` `COUNTRIES` list, `web/src/app/[country]/page.tsx` `KNOWN_COUNTRIES` (for `generateStaticParams`), `web/src/lib/colors.ts` `COUNTRY_COLORS`.
- New countries inserted directly into the live CockroachDB (same seed data as schema.sql, since schema was already applied once) and the scraper run for real — 1,418 indicators now tracked across all 8 countries (France 163, Germany 176, Ireland 136, Kenya 69, South Africa 117 joining the existing US/UK/Japan totals).
- **Color assignment**: used all 8 slots of the dataviz skill's validated categorical palette (previously only 3 were in use). Ran `validate_palette.js --pairs all` on the full 8-set — it FAILS the strict all-pairs CVD/normal-vision floor, which the palette doc itself says is expected and unavoidable past 4 simultaneous categorical slots ("no ordering can" pass beyond that). This is accepted rather than worked around, because every place a country color appears in this app (nav tabs, card borders, chart lines) is always paired with the country's flag emoji and name as direct text — the palette's own required mitigation for the 6–8 floor band ("secondary encoding: direct labels") is already structurally present everywhere, so color is never the sole identifier. Assignments leaned thematic where it was free (Ireland=green, Germany=gold, Kenya=red — all from the country's own flag) since nothing else constrained the choice.
- Rebuilt (`next build`, all 8 `/[country]` routes statically generated), spot-checked all 5 new country pages with `next dev` + curl (200s, real content, no errors), then deployed to production and re-verified both live domains serve all 5 new countries.

## Added 4 more countries + timezone fix (2026-09-16)

User asked to add Italy, Zimbabwe, Australia, and Singapore (site now tracks 12 countries total), and separately flagged that the "last updated" timestamp needed to reflect BST (it's currently British Summer Time), not GMT.

- All 4 slugs verified directly against TradingEconomics before wiring up (`italy`, `zimbabwe`, `australia`, `singapore` all real, populated pages).
- Same extension pattern as before: `db/schema.sql`, `scraper/scrape.py` `COUNTRIES`, `KNOWN_COUNTRIES` in `[country]/page.tsx`, `COUNTRY_COLORS` in `lib/colors.ts`; new countries inserted directly into the live DB, then a real (non-dry-run) scraper run — **1,871 indicators across 12 countries** (Italy 147, Zimbabwe 39, Australia 167, Singapore 100 joining the rest).
- **Color assignment**: the existing 8-slot palette was already fully used, so 4 new hues were chosen and iteratively validated with `validate_palette.js --pairs all` in both light and dark mode until no *new* worst-case pair was introduced beyond the baseline the 8-country set had already accepted (existing note above still applies re: the expected >4-slot floor-band FAIL and why it's fine here). Went through a couple of rejected attempts first: a rose/pink for Singapore was nearly indistinguishable from Kenya's red (ΔE 5.5) — replaced with brown; an indigo/Tailwind-400 dark-mode set failed the lightness band and put Australia's indigo almost on top of the UK's violet (ΔE 3.1) — replaced with a more saturated, properly-banded indigo. Final: Italy = cyan `#0891b2`/`#22a5c4`, Zimbabwe = fuchsia `#86198f`/`#c026d3`, Australia = indigo `#4f46e5`/`#6366f1`, Singapore = brown `#92400e`/`#b45309`.
- **Timezone bug fix**: `formatScrapedAt` (`lib/format.ts`) had no `timeZone` set, so `toLocaleString` fell back to whatever timezone the rendering server uses — on Vercel that's UTC, so the displayed "Updated ..." time was silently off by an hour during BST. Fixed by pinning `timeZone: "Europe/London"` with `timeZoneName: "short"`, so it now always shows correct UK local time and self-labels "BST" or "GMT" depending on the date, same DST-aware approach already used for the nightly cron. Verified "BST" appears in the rendered output both locally and in production.
- Also added `.claude/` to `.gitignore` — the harness had written a `scheduled_tasks.lock` file into the repo while a background task was in flight; caught before it was committed.
- Rebuilt (16 static routes now), verified all 4 new country pages + the BST string in production, deployed.

## Market Personality feature (2026-09-17)

User wanted a qualitative, non-technical-friendly layer on top of the raw indicators — a 1-5 score "wrapped in a question" with grounded narrative text. Iterated through a few framings in conversation before landing here:
1. First pass: 15 generic composite-indicator ideas (ratios of existing scraped fields) — user wanted something more semantically interpretable than raw ratios.
2. Second pass: 5 independent "category scorecards" (Power of Financial Institutions, Cost-of-Living Squeeze, Growth Momentum, Fiscal Resilience, Trade Position), each with its own 1-5 scale — built this partway (`country_insights` table, `scraper/insights.py` v1) then user said stop, hadn't decided which one, and only wanted one to start.
3. Final framing (from a forwarded message thread): **"Market Personality"** — reframe the same 5 categories as bipolar personality traits on a single country, then synthesize all 5 into one archetype + narrative, like a personality-test result. This is what got built. The user confirmed they wanted the full thing built at this point, not just one trait.

**Model**: explicitly downgraded from the claude-api skill's Opus-4.8 default to **Claude Sonnet 5** (`claude-sonnet-5`) — user asked "can it not be built without opus" (cost concern); this task (comparing 12 countries' numbers, writing a grounded one-liner) doesn't need Opus-tier reasoning, and Sonnet 5 is $3/$15 vs Opus's $5/$25 per MTok. Confirmed via `AskUserQuestion`.

**Design**:
- 5 bipolar traits, each mapped to real indicators confirmed present for all-or-nearly-all 12 countries (checked live against the DB, not assumed): Assertiveness (Reserved↔Assertive), Composure (Anxious↔Composed), Drive (Sluggish↔Ambitious), Discipline (Reckless↔Disciplined), Independence (Dependent↔Self-Reliant). Score 5 always = the "positive/high" pole, kept consistent for UI rendering.
- Two-step generation (`scraper/insights.py`): (1) one Sonnet call per trait, scoring **all 12 tracked countries against each other in the same call** — this matters, since a 1-5 score only means something relative to the peer set, not in isolation — using structured outputs (`output_config.format` json_schema) for reliable parsing; (2) one Sonnet call per country synthesizing its 5 trait scores into an archetype title + 2-3 sentence narrative, explicitly prompted to "find the through-line" rather than restate each trait. 17 calls/night total, cheap.
- Pole labels (`Reserved`/`Assertive` etc.) are fixed in code (`scraper/insights.py` TRAITS, mirrored in `web/src/lib/traits.ts` TRAIT_META) — the model only returns a score + summary, never invents label wording, so the UI vocabulary stays stable night over night.
- New tables: `country_traits` (one row per country×trait, latest only via upsert), `country_personas` (one row per country, latest only). Applied to the live CockroachDB (additive, `CREATE TABLE IF NOT EXISTS`).
- New UI: a second "Personality" tab per country (`/[country]/personality`, `SectionTabs` component added to both pages) with a custom-SVG radar chart (`RadarChart` — 5 axes, interactive hover/click per vertex showing that trait's grounded reasoning, country accent color, follows the same hand-rolled-SVG approach as `LineChart` rather than a charting library) plus a text `TraitList` fallback below (satisfies the dataviz skill's "always have a table/text alternative" rule) and the archetype title + narrative up top.
- The web app itself never calls Anthropic — only the Python nightly job does (in GitHub Actions), so `ANTHROPIC_API_KEY` only needs to be a **GitHub secret**, not a Vercel env var.
- Wired into `.github/workflows/scrape.yml` as a step after the scraper (`insights.py`), timeout bumped 10→20 min to cover the extra 17 sequential API calls.
- Verified: `next build` passes (28 routes incl. 12 new `/personality` pages), local `next dev` shows the correct "not generated yet" empty state (tables exist but no data yet — waiting on the user's Anthropic API key), deployed to production and confirmed live.

**Not yet done** — waiting on the user to provide an `ANTHROPIC_API_KEY`:
- Set it as a GitHub Actions secret (`gh secret set ANTHROPIC_API_KEY`)
- Run `scraper/insights.py` once manually to seed real data (same pattern as the original scraper seeding)
- Verify real archetypes/traits render correctly end-to-end

## Market Personality: manual seed, no API key available (2026-09-17)

User doesn't have an Anthropic API key — only a claude.ai subscription, which is billed separately from API access and can't authenticate an unattended script. Two different problems, handled differently:

- **One-time seed (done):** rather than needing `insights.py` to call the API, the trait scoring and persona synthesis were performed directly in-session — pulled the real live indicator data for all 5 traits × 12 countries (`SELECT ... JOIN LATERAL` for latest snapshot per indicator, same query shape as `insights.py`), reasoned through genuinely comparative 1-5 scores across the 12-country set by hand (documented reasoning: e.g. Ireland's eye-catching current-account/budget numbers are noted as inflated by multinational profit-shifting rather than taken at face value; Japan's near-balanced budget vs. its 249%-of-GDP debt load; Zimbabwe's strong headline growth vs. its 30% interest rate signaling real instability — the kind of judgment call the "personality" framing exists for), wrote all 60 trait summaries + 12 archetype/narrative pairs, and inserted them directly via a one-off script (`web/seed-personalities.tmp.js`, deleted after running — not committed, this was a data-seeding action not a code change). Verified real content renders in both `next dev` and production for several countries (US "The Confident Spender", Singapore "The Disciplined Overachiever", Zimbabwe "The Volatile Comeback"). Redeployed so it's live immediately rather than waiting on the 1hr ISR revalidation window.
- **Nightly automation (still blocked):** `insights.py` still requires a real `ANTHROPIC_API_KEY` to run unattended in GitHub Actions — there's no way around this for a headless cron job. Made the workflow step `continue-on-error: true` so a missing key never breaks the (more important) scraper step. The seeded data above will sit unchanged until either a key is provided or it's manually refreshed the same way again.

## Expansion to 179 countries + navigation redesign (2026-09-17)

User pasted TradingEconomics' full country roster (~193 entries from a global indicators comparison table) and asked to track all of them with full data + Market Personality for each. 12 were already tracked, leaving 167 new.

- **Slug verification, not guesses.** Wrote `scraper/verify_slugs.py` (one-off utility, kept in repo for future re-use) to live-check every candidate slug against TradingEconomics before touching anything - naive lowercase-hyphenate fails for a meaningful chunk of these (Ivory Coast is `cote-d-ivoire`, East Timor is `timor-leste`, Congo vs Republic of the Congo are `congo` vs `republic-of-the-congo`, Macedonia resolved as `macedonia` not `north-macedonia`, etc.). All 167 verified 200 + >50KB real content on the first pass with candidate fallback lists for ~25 known-tricky names. New single source of truth: `scraper/countries_extra.py` (name, slug, ISO code, flag) - `scrape.py`, `db/schema.sql`, and the live DB insert were all generated from it rather than hand-transcribed three times.
- **Scraper**: `COUNTRIES` now built from the original 12 + all 167 extras (179 total). No logic changes needed - same per-country scrape loop, just a longer list. GitHub Actions `timeout-minutes` raised 20→60 (real-world pace observed: ~16s/country including the polite delay, so ~48 min for a full run).
- **Market Personality had to be rebuilt to not need an LLM at all**, not just to tolerate a missing key. The original per-trait LLM call asked the model to eyeball relative ranking across N countries in one prompt - fine at 12, not viable to hand-reason at 179. Rewrote `scraper/insights.py` with a **deterministic percentile-rank mode** as the primary path (LLM mode still available and auto-used if `ANTHROPIC_API_KEY` is ever set - the trait-scoring call already batched all countries per trait so it scales fine; only the per-country persona-synthesis call becomes ~179 calls instead of ~12, still cheap on Sonnet):
  - Each trait's composite score now comes **only** from indicators that are genuinely comparable across every currency in the tracked set - percent figures (inflation, unemployment, growth, debt-to-GDP, budget, current-account-to-GDP) or GDP itself, which TradingEconomics reports in USD across all 179 countries (verified against the live DB, not assumed). Absolute local-currency figures (Money Supply M1, Central Bank Balance Sheet, FX Reserves, Balance of Trade, External Debt) were dropped from the *scoring* formula for this reason - they can't be honestly ranked against each other without an FX table, which isn't scraped. This is a real, deliberate constraint, not an oversight: assertiveness's old "financial heft" metrics simply don't survive going from 12 real-world-known economies (where I could reason about relative FX-adjusted size myself) to 179 where that's not tractable by hand or by formula without more data.
  - Score = average percentile-rank (0-1, "goodness" direction normalized per metric) across a trait's available sub-metrics, bucketed into even quintiles (`<0.2`→1 ... `>=0.8`→5) - this scales cleanly to any N and always uses the full 1-5 range.
  - Summaries are templated but genuinely grounded (cite the actual metric value + real percentile tier + the true count of tracked countries), tagged `model="deterministic-v1"` in the DB so it's visibly distinct from LLM-generated rows (`model="claude-sonnet-5"`) - if a key gets added later, automated runs will visibly upgrade rows over time.
  - Persona archetype: picks the 2 most extreme traits (`|score-3|` largest), builds a title from a small deterministic (hash-seeded per country, not random) phrase bank per trait/direction, and writes a narrative that quotes those two traits' own grounded summaries directly rather than generating free prose.
- **Navigation could not stay a pill-tab-bar at 179 countries** - replaced `CountryNav` (deleted) with `CountrySelect`, a dependency-free searchable combobox (type-to-filter, no cmdk/Radix Select, consistent with the project's existing preference for hand-rolled components over new UI libraries), used in the header of every country/personality page.
- **New homepage** (`/` no longer redirects to `/united-states`): title, a large `CountrySelect`, a "Featured" grid of the original 12, and a full alphabetical multi-column list of all 179 for browsability without typing.
- **Build-time static generation scoped down on purpose**: `generateStaticParams` for `/[country]` and `/[country]/personality` now only pre-renders the original "featured" 12 (renamed from `KNOWN_COUNTRIES`) instead of all 179 - keeps Vercel builds fast. Every other country still works via Next's default dynamic rendering + the existing `revalidate = 3600` ISR, confirmed working locally for both a pre-scraped country (Kenya) and one scraped fresh mid-run (Afghanistan).
- All 179 countries inserted into the live DB (`db/schema.sql` re-applied, additive/idempotent as always). Full scrape kicked off in the background (`scraper/scrape.py`, no dry-run) - see next section for the outcome once it lands.

## Navigation/rebrand + a real prerendering bug (2026-09-17)

Three requested UI changes, plus one bug found and fixed while verifying them in production:

- Header title "Economic Indicators" → "Market Personalities" (mark "EI" → "MP"), including page metadata.
- `SectionTabs` reordered so **Personality is the default/first tab**, Overview second (was the reverse).
- Overview rebuilt from stacked all-categories sections into a **category filter**: pills for each category plus a trailing "All" pill; **GDP is the default view**; clicking a pill shows only that category's cards (or everything, for "All").
- **Bug caught during production verification, not local dev**: the category browser was originally built as a client component reading the active category via `useSearchParams()`, wrapped in `<Suspense>`, specifically to avoid forcing the whole page dynamic (see prior ISR-preservation note below). Locally this looked correct — `next dev` always does per-request dynamic rendering, so curl against localhost showed real card counts (25/396/68 for GDP/all/labour). But in an actual production build, Next.js's documented behavior for `useSearchParams()` is to bail the entire subtree to **client-only rendering** whenever the containing route is prerendered — so the real, deployed HTML for every country page (static *and* dynamically-rendered-then-ISR-cached ones alike, confirmed on both `/united-states` and a non-featured country `/afghanistan`) was just the `<Skeleton>` fallback, with real cards only appearing after client JS hydrated. Caught by re-running the `data-slot="card"` count check against production and getting 0 where 25 was expected, with `animate-pulse` (the skeleton's class) present instead.
  - **Fix**: dropped `useSearchParams()`/`Suspense` entirely from `IndicatorCategoryBrowser`. The default category now comes from plain component state (`useState(fallback)`), so it renders synchronously in the prerendered/SSG or SSR HTML with no client-only gate. A `useEffect` on mount reads `window.location.search` once (client-side only, after hydration) to honor deep links like the indicator detail page's "Back to {country}" link (`?category=labour`) — this trades a rare, near-instant post-hydration category switch (only when arriving via a deep link) for eliminating the skeleton flash on every normal page load. `selectCategory` now updates state directly and syncs the address bar via `window.history.replaceState` instead of the router.
  - Verified fix with `.next/server/app/united-states.html` (the actual static output file) directly, not just a curl of the live site: 25 `data-slot="card"` matches, confirming real prerendered content. Re-confirmed against production post-deploy.
  - **Lesson**: `next dev` and a real `next build`/production deploy can differ meaningfully for anything gated behind `useSearchParams()` + Suspense — verify data-dependent client components against an actual production (or at least `next build && next start`) deployment, not just dev, before considering a feature done.

## Full 179-country scrape + Market Personality generation completed (2026-09-17)

- Background scrape finished cleanly: **13,388 indicator rows across all 179 countries**, no failures.
- Ran `scraper/insights.py` in deterministic mode (no API key) against the full live dataset:
  - All 5 traits scored for the large majority of countries (161-177 countries per trait, out of 179 - the gap is countries missing that specific comparable metric, e.g. no reported Current Account to GDP).
  - **157/179 countries got a full persona** (archetype title + narrative) - requires all 5 traits present. The remaining 22 have partial trait coverage (too few tracked indicators, typically small/data-sparse economies) and were deliberately skipped rather than synthesizing a persona from incomplete signal.
  - Verified the existing UI already degrades gracefully for the partial case without any code changes needed: the persona/archetype box only renders `{persona && (...)}`, so a country with e.g. 3/5 traits (confirmed on Afghanistan: Assertiveness, Composure, Discipline present, Drive/Independence missing) still shows its radar chart and trait list, just without an archetype title - not an error state, not a blank page.
- Rebuilt and redeployed to production. Spot-checked real generated content live: US "The Titan Overextended", Vietnam "The Giant Ambitious", Zambia "The Strained Ambitious", Afghanistan (partial traits only, no persona box, as expected).
- Nightly GitHub Actions cron will now pick up all 179 countries for both the scrape and (once/if `ANTHROPIC_API_KEY` is ever added) the personality regeneration step - no further manual steps needed for this to stay current.

## Bug fix: deterministic persona narrative misstated "middle of the pack" (2026-09-17)

User flagged Ireland's persona ("The Titan Sluggish") for a closer look after noticing its GDP Annual Growth Rate (-0.4%) looked odd next to the assertiveness claim. Investigated end to end:

- **Not a data bug.** Cross-checked the scraped value directly against the live TradingEconomics page (`tradingeconomics.com/ireland/gdp-growth-annual`): -0.4% for Q2 2026, previous -13.2%, matches exactly. This is real (Ireland's GDP annual growth is genuinely this volatile due to multinational profit-shifting distorting headline GDP) - not a scraper parsing error.
- **Not a percentile-math bug either.** Verified by hand: Ireland's -0.4% sits at percentile 0.090 among the 168 countries with this metric (i.e. genuinely bottom ~9%), which correctly buckets to score 1 ("near the bottom") under `score_from_percentile`.
- **Found a real bug in `build_deterministic_persona` (`scraper/insights.py`).** Ireland's actual trait scores are Assertiveness=5, Discipline=5, Independence=5, Drive=1, Composure=3 - four of five traits tied at the maximum extremity (`|score-3|=2`). The function picked only the first two (by `TRAITS` list order, an arbitrary tie-break, not significance) for the archetype title/narrative, then appended a hardcoded closing sentence claiming the *other* traits "land closer to the middle of the pack" - false for Discipline and Independence, which are just as extreme as the two that got named. Checked how common this is: **101 of 157 full-persona countries (64%)** have 3+ traits tied at the cutoff extremity, since quintile bucketing into only 5 scores makes ties common at scale - this wasn't an Ireland-only edge case.
  - **Fix**: after picking the top two traits for the title (title stays 2 words by design), the narrative now separately checks the remaining three traits against the top two's extremity cutoff - any that tie get named explicitly ("Discipline and Independence are just as extreme here, so this isn't a one-off"), and only genuinely middling traits get the "closer to the middle of the pack" line. Added a `join_words()` helper for natural-language lists of 1-3 items.
  - Verified against Ireland's exact real data before rerunning at scale; re-ran `insights.py` (deterministic mode) for all 179 countries, redeployed, confirmed the corrected narrative live in production.

## Remaining / future work

- Nothing blocking on the core dashboard — the site is live and the nightly scrape is scheduled. First automatic nightly run will happen at the next midnight Europe/London.
- Market Personality has real seeded data for all 12 countries (see above) but **will not update on its own** until `ANTHROPIC_API_KEY` is added as a GitHub Actions secret — the nightly `insights.py` step currently soft-fails every night with no key present.
- No dark-mode toggle UI built (not requested) — dark mode follows OS `prefers-color-scheme` automatically via the existing shadcn CSS variable setup.
- `next.config.ts` does not have Cache Components (`cacheComponents: true`) enabled — using the standard/previous caching model, so pages use plain `async` Server Components with `export const revalidate` (1hr) for ISR rather than `use cache` + Suspense-wrapped params.
- Dashboard cards show TE's own Last/Previous/Highest/Lowest rather than a sparkline (would need N+1 history queries with little payoff on day one). Once a few weeks of nightly history accumulate, revisit whether a lightweight sparkline on cards is worth adding.
- Only one snapshot exists per indicator right now, so every detail-page chart currently shows the "first snapshot" single-point state — this is expected and will fill in as the nightly job runs.
