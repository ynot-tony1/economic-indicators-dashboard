"""
Nightly "Market Personality" generator.

Two modes:
  - LLM mode (ANTHROPIC_API_KEY set): Claude Sonnet 5 scores each trait for
    all tracked countries relative to each other, then synthesizes an
    archetype + narrative per country. Best prose quality.
  - Deterministic mode (no key): percentile-ranks every country against the
    whole tracked set on real, currency-comparable indicators (percent
    figures, or GDP in USD) - no LLM needed, works at any scale, and every
    number in the output is real. Automatically upgrades to LLM mode the
    moment a key is added; deterministic rows are tagged model="deterministic-v1"
    so it's obvious which rows are still waiting to be upgraded.

See INSIGHT_CATEGORIES.md for the trait design.

Usage:
    DATABASE_URL=... python insights.py                       # deterministic
    ANTHROPIC_API_KEY=... DATABASE_URL=... python insights.py  # LLM-enhanced
    python insights.py --dry-run                                # print only
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

import psycopg

try:
    import anthropic
except ImportError:
    anthropic = None

LLM_MODEL = "claude-sonnet-5"
DETERMINISTIC_MODEL = "deterministic-v1"

# Score 5 = pole_high, 1 = pole_low. Pole wording lives here, not the DB, so
# it stays fixed run over run. `metrics` are the ONLY indicators fed into the
# deterministic composite - each must be a percent (or otherwise currency-
# comparable) figure so ranking works honestly across any set of countries,
# however many currencies are involved. `direction` says which raw direction
# is "good" (maps toward pole_high).
TRAITS = [
    {
        "slug": "assertiveness",
        "name": "Assertiveness",
        "pole_low": "Reserved",
        "pole_high": "Assertive",
        "question": "How dominant is this country's economy on the world stage?",
        "metrics": [("GDP", "higher")],
        "extra_display": ["Interest Rate"],
    },
    {
        "slug": "composure",
        "name": "Composure",
        "pole_low": "Anxious",
        "pole_high": "Composed",
        "question": "How much is daily life squeezing people right now?",
        "metrics": [("Inflation Rate", "lower"), ("Unemployment Rate", "lower")],
        "extra_display": [],
    },
    {
        "slug": "drive",
        "name": "Drive",
        "pole_low": "Sluggish",
        "pole_high": "Ambitious",
        "question": "Is this economy accelerating or stalling?",
        "metrics": [("GDP Annual Growth Rate", "higher")],
        "extra_display": ["GDP Growth Rate"],
    },
    {
        "slug": "discipline",
        "name": "Discipline",
        "pole_low": "Reckless",
        "pole_high": "Disciplined",
        "question": "How much room does this government have before debt becomes a problem?",
        "metrics": [("Government Debt to GDP", "lower"), ("Government Budget", "higher")],
        "extra_display": [],
    },
    {
        "slug": "independence",
        "name": "Independence",
        "pole_low": "Dependent",
        "pole_high": "Self-Reliant",
        "question": "Is this country a net lender or net borrower to the rest of the world?",
        "metrics": [("Current Account to GDP", "higher")],
        "extra_display": ["Balance of Trade", "External Debt"],
    },
]

# Phrase banks for the deterministic archetype title. Picked deterministically
# per country (hash-seeded) so it's stable run to run, not random.
ARCHETYPE_WORDS = {
    ("assertiveness", "high"): ["Powerhouse", "Heavyweight", "Titan", "Giant"],
    ("assertiveness", "low"): ["Underdog", "Minnow", "Lightweight"],
    ("composure", "high"): ["Composed", "Calm", "Steady", "Unshaken"],
    ("composure", "low"): ["Anxious", "Strained", "Uneasy"],
    ("drive", "high"): ["Ambitious", "Surging", "Fast-Mover", "Dynamo"],
    ("drive", "low"): ["Sluggish", "Stalling", "Idle"],
    ("discipline", "high"): ["Disciplined", "Prudent", "Careful", "Frugal"],
    ("discipline", "low"): ["Reckless", "Free-Spending", "Overextended"],
    ("independence", "high"): ["Self-Reliant", "Independent", "Self-Sufficient"],
    ("independence", "low"): ["Dependent", "Import-Hungry", "Reliant"],
}

TRAIT_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "scores": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "country_code": {"type": "string"},
                    "score": {"type": "integer", "enum": [1, 2, 3, 4, 5]},
                    "summary": {"type": "string"},
                },
                "required": ["country_code", "score", "summary"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["scores"],
    "additionalProperties": False,
}

PERSONA_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "archetype_title": {"type": "string"},
        "narrative": {"type": "string"},
    },
    "required": ["archetype_title", "narrative"],
    "additionalProperties": False,
}


def stable_seed(*parts: str) -> int:
    digest = hashlib.sha256("|".join(parts).encode()).hexdigest()
    return int(digest[:8], 16)


def fetch_country_data(cur, indicator_names: list[str]) -> dict[str, dict]:
    """Latest snapshot value for each named indicator, per country (all tracked)."""
    cur.execute(
        """
        SELECT c.code, c.name, i.name AS indicator_name, i.unit, s.last_value
        FROM countries c
        JOIN indicators i ON i.country_id = c.id
        JOIN LATERAL (
            SELECT last_value
            FROM indicator_snapshots s2
            WHERE s2.indicator_id = i.id
            ORDER BY s2.scraped_at DESC
            LIMIT 1
        ) s ON true
        WHERE i.name = ANY(%s)
        ORDER BY c.sort_order, i.name
        """,
        (indicator_names,),
    )
    by_country: dict[str, dict] = {}
    for code, name, indicator_name, unit, last_value in cur.fetchall():
        entry = by_country.setdefault(code, {"name": name, "values": {}, "raw": {}})
        entry["raw"][indicator_name] = last_value
        value = f"{last_value} {unit}".strip() if last_value is not None else "no data"
        entry["values"][indicator_name] = value
    return by_country


# ---------------------------------------------------------------------------
# Deterministic mode
# ---------------------------------------------------------------------------


def percentile_rank(values: dict[str, float]) -> dict[str, float]:
    """0 (worst) .. 1 (best) rank among the given {code: float} values."""
    if not values:
        return {}
    ordered = sorted(values.items(), key=lambda kv: kv[1])
    n = len(ordered)
    if n == 1:
        return {ordered[0][0]: 0.5}
    return {code: i / (n - 1) for i, (code, _) in enumerate(ordered)}


def score_from_percentile(p: float) -> int:
    if p < 0.2:
        return 1
    if p < 0.4:
        return 2
    if p < 0.6:
        return 3
    if p < 0.8:
        return 4
    return 5


def deterministic_trait_scores(trait: dict, by_country: dict[str, dict]) -> list[dict]:
    # Per sub-metric, compute a goodness-percentile (0 worst .. 1 best) per country.
    metric_percentiles: list[dict[str, float]] = []
    for metric_name, direction in trait["metrics"]:
        raw: dict[str, float] = {}
        for code, entry in by_country.items():
            v = entry["raw"].get(metric_name)
            if v is None:
                continue
            try:
                raw[code] = float(v)
            except (TypeError, ValueError):
                continue
        if not raw:
            continue
        ranked = percentile_rank(raw)
        if direction == "lower":
            ranked = {code: 1 - p for code, p in ranked.items()}
        metric_percentiles.append(ranked)

    composite: dict[str, float] = {}
    for code in by_country:
        available = [mp[code] for mp in metric_percentiles if code in mp]
        if available:
            composite[code] = sum(available) / len(available)

    results = []
    total = len(by_country)
    for code, p in composite.items():
        score = score_from_percentile(p)
        entry = by_country[code]
        primary_metric = trait["metrics"][0][0]
        primary_value = entry["values"].get(primary_metric, "no data")

        if score == 5:
            phrasing = f"Ranks near the top of all {total} countries tracked here on {primary_metric.lower()} ({primary_value})."
        elif score == 4:
            phrasing = f"Sits in the upper tier of the {total} tracked countries on {primary_metric.lower()} ({primary_value})."
        elif score == 3:
            phrasing = f"Lands in the middle of the pack among {total} tracked countries on {primary_metric.lower()} ({primary_value})."
        elif score == 2:
            phrasing = f"Sits in the lower tier of the {total} tracked countries on {primary_metric.lower()} ({primary_value})."
        else:
            phrasing = f"Ranks near the bottom of all {total} countries tracked here on {primary_metric.lower()} ({primary_value})."

        results.append({"country_code": code, "score": score, "summary": phrasing})
    return results


def join_words(words: list[str]) -> str:
    if len(words) == 1:
        return words[0]
    if len(words) == 2:
        return f"{words[0]} and {words[1]}"
    return f"{', '.join(words[:-1])}, and {words[-1]}"


def build_deterministic_persona(country_name: str, code: str, traits_for_country: list[dict]) -> dict:
    ranked_by_extremity = sorted(traits_for_country, key=lambda t: abs(t["score"] - 3), reverse=True)
    top_two = ranked_by_extremity[:2]
    rest = ranked_by_extremity[2:]

    words = []
    for t in top_two:
        direction = "high" if t["score"] >= 4 else "low" if t["score"] <= 2 else None
        if direction is None:
            continue
        bank = ARCHETYPE_WORDS[(t["slug"], direction)]
        idx = stable_seed(code, t["slug"]) % len(bank)
        words.append(bank[idx])

    if not words:
        title = "The Balanced Economy"
    elif len(words) == 1:
        title = f"The {words[0]}"
    else:
        title = f"The {words[0]} {words[1]}"

    if len(top_two) < 2:
        narrative = (
            f"{country_name} doesn't stand out strongly in either direction on any single trait "
            f"tracked here - a genuinely middle-of-the-pack economy across the board."
        )
        return {"archetype_title": title, "narrative": narrative}

    narrative = (
        f"{country_name} is best defined by two things: its {top_two[0]['name'].lower()} "
        f"({top_two[0]['summary']}) and its {top_two[1]['name'].lower()} "
        f"({top_two[1]['summary']})."
    )

    # With only 5 score buckets, it's common for more than two traits to tie for the most
    # extreme score - don't claim those tied traits are "middle of the pack" when they aren't.
    cutoff = abs(top_two[1]["score"] - 3)
    also_extreme = [t for t in rest if cutoff > 0 and abs(t["score"] - 3) == cutoff]
    middling = [t for t in rest if t not in also_extreme]

    if also_extreme:
        names = join_words([t["name"] for t in also_extreme])
        verb = "is" if len(also_extreme) == 1 else "are"
        narrative += f" {names} {verb} just as extreme here, so this isn't a one-off."
    if middling:
        names = join_words([t["name"] for t in middling])
        verb = "lands" if len(middling) == 1 else "land"
        narrative += f" {names} {verb} closer to the middle of the pack."

    return {"archetype_title": title, "narrative": narrative}


# ---------------------------------------------------------------------------
# LLM mode
# ---------------------------------------------------------------------------


def build_trait_prompt(trait: dict, by_country: dict[str, dict]) -> str:
    rows = []
    for code, entry in by_country.items():
        values = ", ".join(f"{k}: {v}" for k, v in entry["values"].items())
        rows.append(f"- {entry['name']} ({code}): {values}")
    table = "\n".join(rows)

    return f"""You are scoring a personality trait for a "market personality" feature on a public economic
dashboard aimed at non-technical readers. Think of each country as having a character, the way a
personality test scores a person - you're scoring the country's economy on one trait axis.

Trait: {trait['name']} ({trait['pole_low']} = 1, through, {trait['pole_high']} = 5)
What this trait measures: {trait['question']}

Score each of the following {len(by_country)} countries from 1 to 5, RELATIVE TO EACH OTHER ONLY
(how these specific tracked countries compare to each other on this data, not an absolute global
judgment). Use the full 1-5 range where the data supports it; do not default everyone to 3.

Data (most recent scraped values for each country):
{table}

For each country, write one short sentence explaining the score in plain, non-technical, personality-ish
language (e.g. "runs a tight ship", "spends freely") that still references at least one of the actual
numbers above - not a vague generalization. If a country is missing some of the data, say so plainly and
score cautiously based on what's available.

Return a score and summary for every one of the {len(by_country)} countries listed above."""


def generate_trait_scores(client, trait: dict, by_country: dict[str, dict]) -> list[dict]:
    prompt = build_trait_prompt(trait, by_country)
    response = client.messages.create(
        model=LLM_MODEL,
        max_tokens=8192,
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": TRAIT_RESPONSE_SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    text = next(block.text for block in response.content if block.type == "text")
    return json.loads(text)["scores"]


def build_persona_prompt(country_name: str, traits_for_country: list[dict]) -> str:
    trait_lines = "\n".join(
        f"- {t['name']} ({t['pole_low']} 1 <-> 5 {t['pole_high']}): scored {t['score']}/5 - {t['summary']}"
        for t in traits_for_country
    )
    return f"""You are writing a "market personality" profile for {country_name} on a public economic
dashboard, in the style of a personality-test result: a short, memorable archetype title plus a character
sketch. Be creative connecting these traits into one cohesive personality, the way a magazine profile
would - find the through-line between the traits rather than just restating them one by one. Stay grounded
in what the trait scores actually say; do not invent facts not implied by them.

{country_name}'s trait scores:
{trait_lines}

Write:
1. archetype_title: a short, evocative 2-5 word title (e.g. "The Disciplined Powerhouse", "The Ambitious
   Spender", "The Cautious Trader") that captures the overall personality.
2. narrative: 2-3 sentences weaving the traits together into a cohesive character sketch, plain language,
   for a non-technical reader."""


def generate_persona(client, country_name: str, traits_for_country: list[dict]) -> dict:
    prompt = build_persona_prompt(country_name, traits_for_country)
    response = client.messages.create(
        model=LLM_MODEL,
        max_tokens=1024,
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": PERSONA_RESPONSE_SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    text = next(block.text for block in response.content if block.type == "text")
    return json.loads(text)


# ---------------------------------------------------------------------------
# Shared driver
# ---------------------------------------------------------------------------


def run(dry_run: bool = False) -> int:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        return 1

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    use_llm = bool(api_key) and anthropic is not None
    model_tag = LLM_MODEL if use_llm else DETERMINISTIC_MODEL
    print(f"Mode: {'LLM (' + LLM_MODEL + ')' if use_llm else 'deterministic (no ANTHROPIC_API_KEY set)'}")

    conn = psycopg.connect(database_url, autocommit=False)
    client = anthropic.Anthropic(api_key=api_key) if use_llm else None

    traits_by_country: dict[str, list[dict]] = {}
    names_by_code: dict[str, str] = {}

    for trait in TRAITS:
        print(f"Scoring trait: {trait['name']} ...")
        indicator_names = [m for m, _ in trait["metrics"]] + trait["extra_display"]
        with conn.cursor() as cur:
            by_country = fetch_country_data(cur, indicator_names)

        if use_llm:
            scores = generate_trait_scores(client, trait, by_country)
        else:
            scores = deterministic_trait_scores(trait, by_country)
        print(f"  got {len(scores)} country scores")

        for row in scores:
            code = row["country_code"]
            names_by_code[code] = by_country.get(code, {}).get("name", code)
            traits_by_country.setdefault(code, []).append(
                {
                    "slug": trait["slug"],
                    "name": trait["name"],
                    "pole_low": trait["pole_low"],
                    "pole_high": trait["pole_high"],
                    "score": row["score"],
                    "summary": row["summary"],
                }
            )

        if dry_run:
            for row in scores[:3]:
                print(f"  sample: {row['country_code']} = {row['score']} - {row['summary']}")
            continue

        with conn.cursor() as cur:
            for row in scores:
                cur.execute(
                    """
                    INSERT INTO country_traits (country_id, trait, score, summary, model)
                    SELECT id, %(trait)s, %(score)s, %(summary)s, %(model)s
                    FROM countries WHERE code = %(country_code)s
                    ON CONFLICT (country_id, trait) DO UPDATE SET
                        score = EXCLUDED.score,
                        summary = EXCLUDED.summary,
                        model = EXCLUDED.model,
                        generated_at = now()
                    """,
                    {
                        "trait": trait["slug"],
                        "score": row["score"],
                        "summary": row["summary"],
                        "model": model_tag,
                        "country_code": row["country_code"],
                    },
                )
        conn.commit()
        print(f"  wrote {len(scores)} scores for {trait['slug']}")

    print("Synthesizing personas ...")
    for code, traits_for_country in traits_by_country.items():
        if len(traits_for_country) < len(TRAITS):
            print(f"  skipping {code}: only {len(traits_for_country)}/{len(TRAITS)} traits scored")
            continue

        if use_llm:
            persona = generate_persona(client, names_by_code[code], traits_for_country)
        else:
            persona = build_deterministic_persona(names_by_code[code], code, traits_for_country)
        print(f"  {code}: {persona['archetype_title']}")

        if dry_run:
            continue

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO country_personas (country_id, archetype_title, narrative, model)
                SELECT id, %(archetype_title)s, %(narrative)s, %(model)s
                FROM countries WHERE code = %(country_code)s
                ON CONFLICT (country_id) DO UPDATE SET
                    archetype_title = EXCLUDED.archetype_title,
                    narrative = EXCLUDED.narrative,
                    model = EXCLUDED.model,
                    generated_at = now()
                """,
                {
                    "archetype_title": persona["archetype_title"],
                    "narrative": persona["narrative"],
                    "model": model_tag,
                    "country_code": code,
                },
            )
        conn.commit()

    conn.close()
    print("Done.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="generate and print only, skip DB writes")
    args = parser.parse_args()
    sys.exit(run(dry_run=args.dry_run))
