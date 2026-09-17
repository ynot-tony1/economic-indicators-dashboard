-- Economic indicators dashboard schema (CockroachDB / Postgres wire-compatible)
-- Run once against your CockroachDB cluster to set up tables:
--   psql "$DATABASE_URL" -f db/schema.sql

CREATE TABLE IF NOT EXISTS countries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,   -- 'US', 'GB', 'JP'
  slug        TEXT NOT NULL UNIQUE,   -- 'united-states', 'united-kingdom', 'japan'
  name        TEXT NOT NULL,          -- 'United States'
  flag_emoji  TEXT NOT NULL,
  sort_order  INT4 NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS indicators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id    UUID NOT NULL REFERENCES countries(id),
  category      TEXT NOT NULL,        -- 'gdp', 'labour', 'prices', ...
  slug          TEXT NOT NULL,        -- 'gdp-growth'
  name          TEXT NOT NULL,        -- 'GDP Growth Rate'
  unit          TEXT,
  source_path   TEXT NOT NULL,        -- '/united-states/gdp-growth'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_id, slug)
);

CREATE TABLE IF NOT EXISTS indicator_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id    UUID NOT NULL REFERENCES indicators(id),
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_date     DATE,               -- parsed reference period, e.g. 2026-08-01
  raw_period      TEXT,               -- original text, e.g. 'Aug/26'
  last_value      DECIMAL,
  previous_value  DECIMAL,
  highest_value   DECIMAL,
  lowest_value    DECIMAL,
  UNIQUE (indicator_id, scraped_at)
);

CREATE INDEX IF NOT EXISTS indicator_snapshots_by_indicator
  ON indicator_snapshots (indicator_id, scraped_at DESC);

-- "Market Personality": each country scored 1-5 on 5 bipolar personality
-- traits (see scraper/insights.py TRAITS), generated nightly by an LLM from
-- that night's scraped indicators. Score 5 = pole_high, 1 = pole_low (the
-- pole labels themselves live in code, not the DB, so wording stays fixed).
-- Only the latest generation is kept per (country, trait).
CREATE TABLE IF NOT EXISTS country_traits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id    UUID NOT NULL REFERENCES countries(id),
  trait         TEXT NOT NULL,        -- 'assertiveness', 'composure', 'drive', 'discipline', 'independence'
  score         INT2 NOT NULL CHECK (score BETWEEN 1 AND 5),
  summary       TEXT NOT NULL,        -- one-sentence, number-grounded explanation
  model         TEXT NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_id, trait)
);

-- The synthesized archetype for a country, woven from its 5 trait scores.
-- One row per country, replaced each night.
CREATE TABLE IF NOT EXISTS country_personas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id        UUID NOT NULL UNIQUE REFERENCES countries(id),
  archetype_title   TEXT NOT NULL,    -- e.g. 'The Disciplined Powerhouse'
  narrative         TEXT NOT NULL,    -- 2-3 sentence character sketch
  model             TEXT NOT NULL,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO countries (code, slug, name, flag_emoji, sort_order) VALUES
  ('US', 'united-states', 'United States', '🇺🇸', 1),
  ('GB', 'united-kingdom', 'United Kingdom', '🇬🇧', 2),
  ('JP', 'japan', 'Japan', '🇯🇵', 3),
  ('FR', 'france', 'France', '🇫🇷', 4),
  ('DE', 'germany', 'Germany', '🇩🇪', 5),
  ('IE', 'ireland', 'Ireland', '🇮🇪', 6),
  ('KE', 'kenya', 'Kenya', '🇰🇪', 7),
  ('ZA', 'south-africa', 'South Africa', '🇿🇦', 8),
  ('IT', 'italy', 'Italy', '🇮🇹', 9),
  ('ZW', 'zimbabwe', 'Zimbabwe', '🇿🇼', 10),
  ('AU', 'australia', 'Australia', '🇦🇺', 11),
  ('SG', 'singapore', 'Singapore', '🇸🇬', 12)
ON CONFLICT (code) DO NOTHING;
