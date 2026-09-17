# Market Personality

Each country is scored 1–5 on 5 bipolar personality traits, then those 5
scores are woven into a short archetype + character sketch — a "personality
test result" for a country's economy, aimed at non-technical readers.
Generated nightly by Claude Sonnet 5 (`claude-sonnet-5`) from that night's
scraped indicators. See `scraper/insights.py` for the implementation.

Coverage was checked directly against the live database (indicators present
for all 12 tracked countries unless noted).

## The 5 trait axes

| Trait | Low pole (1) ↔ High pole (5) | Built from |
|---|---|---|
| **Assertiveness** | Reserved ↔ Assertive | Interest Rate, Money Supply M1 (12/12), Central Bank Balance Sheet, FX Reserves (11/12) |
| **Composure** | Anxious ↔ Composed | Inflation Rate + Unemployment Rate (12/12 both) |
| **Drive** | Sluggish ↔ Ambitious | GDP Annual Growth Rate (12/12), GDP Growth Rate (11/12) |
| **Discipline** | Reckless ↔ Disciplined | Government Debt to GDP + Government Budget (12/12 both) |
| **Independence** | Dependent ↔ Self-Reliant | Balance of Trade + Current Account to GDP (12/12 both), External Debt (11/12) |

Each trait is scored for all 12 tracked countries relative to each other in
one Claude call per trait (5 calls/night), with a one-sentence,
number-grounded explanation per country.

## The persona

A second pass (one call per country, 12/night) takes a country's 5 trait
scores and writes:
- an **archetype title** (2–5 words, e.g. "The Disciplined Powerhouse")
- a **2–3 sentence narrative** weaving the traits into one cohesive
  character sketch — explicitly asked to find the through-line between
  traits rather than just restating them

## Where it lives

- Schema: `db/schema.sql` — `country_traits`, `country_personas`
- Generator: `scraper/insights.py` (`--dry-run` to preview without DB writes)
- UI: a "Personality" tab on each country page — archetype title, a 5-axis
  radar chart (interactive: click/hover a trait for its grounded reasoning),
  and the narrative

Requires an `ANTHROPIC_API_KEY` (Claude Sonnet 5) to generate.
