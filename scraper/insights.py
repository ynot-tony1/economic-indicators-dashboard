"""
Nightly "Market Personality" generator.

Two-step pipeline, both using Claude Sonnet 5:
  1. Trait scoring: for each of 5 bipolar personality traits, score all 12
     tracked countries against each other (1-5, grounded in real scraped
     numbers) in a single call per trait.
  2. Persona synthesis: for each country, weave its 5 trait scores into an
     archetype title + short character sketch, in a single call per country.

See INSIGHT_CATEGORIES.md for the earlier "category scorecard" concept this
superseded, and the "Market Personality" discussion in the conversation this
was designed in for the trait framing.

Usage:
    ANTHROPIC_API_KEY=... DATABASE_URL=... python insights.py
    python insights.py --dry-run   # print without DB writes (needs DATABASE_URL to fetch data)
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import anthropic
import psycopg

MODEL = "claude-sonnet-5"

# Score 5 = pole_high, 1 = pole_low. Pole wording lives here, not the DB, so
# it stays fixed night over night regardless of what the model returns.
TRAITS = [
    {
        "slug": "assertiveness",
        "name": "Assertiveness",
        "pole_low": "Reserved",
        "pole_high": "Assertive",
        "question": "How dominant is this country's banking and monetary system?",
        "indicators": [
            "Interest Rate",
            "Money Supply M1",
            "Central Bank Balance Sheet",
            "Foreign Exchange Reserves",
        ],
    },
    {
        "slug": "composure",
        "name": "Composure",
        "pole_low": "Anxious",
        "pole_high": "Composed",
        "question": "How much is daily life squeezing people right now? "
        "(score HIGH/Composed when inflation and unemployment are LOW; score LOW/Anxious when they are HIGH)",
        "indicators": ["Inflation Rate", "Unemployment Rate"],
    },
    {
        "slug": "drive",
        "name": "Drive",
        "pole_low": "Sluggish",
        "pole_high": "Ambitious",
        "question": "Is this economy accelerating or stalling?",
        "indicators": ["GDP Annual Growth Rate", "GDP Growth Rate"],
    },
    {
        "slug": "discipline",
        "name": "Discipline",
        "pole_low": "Reckless",
        "pole_high": "Disciplined",
        "question": "How much room does this government have before debt becomes a problem? "
        "(score HIGH/Disciplined for low debt-to-GDP and a controlled budget; score LOW/Reckless for the opposite)",
        "indicators": ["Government Debt to GDP", "Government Budget"],
    },
    {
        "slug": "independence",
        "name": "Independence",
        "pole_low": "Dependent",
        "pole_high": "Self-Reliant",
        "question": "Is this country a net lender or net borrower to the rest of the world?",
        "indicators": ["Balance of Trade", "Current Account to GDP", "External Debt"],
    },
]

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


def fetch_country_data(cur, indicator_names: list[str]) -> dict[str, dict]:
    """Latest snapshot value for each named indicator, per country."""
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
        entry = by_country.setdefault(code, {"name": name, "values": {}})
        value = f"{last_value} {unit}".strip() if last_value is not None else "no data"
        entry["values"][indicator_name] = value
    return by_country


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


def generate_trait_scores(client: anthropic.Anthropic, trait: dict, by_country: dict[str, dict]) -> list[dict]:
    prompt = build_trait_prompt(trait, by_country)
    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
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


def generate_persona(client: anthropic.Anthropic, country_name: str, traits_for_country: list[dict]) -> dict:
    prompt = build_persona_prompt(country_name, traits_for_country)
    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": PERSONA_RESPONSE_SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    text = next(block.text for block in response.content if block.type == "text")
    return json.loads(text)


def run(dry_run: bool = False) -> int:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY is not set", file=sys.stderr)
        return 1

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        return 1

    conn = psycopg.connect(database_url, autocommit=False)
    client = anthropic.Anthropic(api_key=api_key)

    # Step 1: score every trait for every country
    # country_code -> [{slug, name, pole_low, pole_high, score, summary}, ...]
    traits_by_country: dict[str, list[dict]] = {}
    names_by_code: dict[str, str] = {}

    for trait in TRAITS:
        print(f"Scoring trait: {trait['name']} ...")
        with conn.cursor() as cur:
            by_country = fetch_country_data(cur, trait["indicators"])

        scores = generate_trait_scores(client, trait, by_country)
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
                print(f"  sample: {row['country_code']} = {row['score']} — {row['summary']}")
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
                        "model": MODEL,
                        "country_code": row["country_code"],
                    },
                )
        conn.commit()
        print(f"  wrote {len(scores)} scores for {trait['slug']}")

    # Step 2: synthesize a persona per country from its 5 trait scores
    print("Synthesizing personas ...")
    for code, traits_for_country in traits_by_country.items():
        if len(traits_for_country) < len(TRAITS):
            print(f"  skipping {code}: only {len(traits_for_country)}/{len(TRAITS)} traits scored")
            continue

        persona = generate_persona(client, names_by_code[code], traits_for_country)
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
                    "model": MODEL,
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
