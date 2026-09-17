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
  ('SG', 'singapore', 'Singapore', '🇸🇬', 12),
  ('AF', 'afghanistan', 'Afghanistan', '🇦🇫', 13),
  ('AL', 'albania', 'Albania', '🇦🇱', 14),
  ('DZ', 'algeria', 'Algeria', '🇩🇿', 15),
  ('AO', 'angola', 'Angola', '🇦🇴', 16),
  ('AG', 'antigua-and-barbuda', 'Antigua and Barbuda', '🇦🇬', 17),
  ('AR', 'argentina', 'Argentina', '🇦🇷', 18),
  ('AM', 'armenia', 'Armenia', '🇦🇲', 19),
  ('AW', 'aruba', 'Aruba', '🇦🇼', 20),
  ('AT', 'austria', 'Austria', '🇦🇹', 21),
  ('AZ', 'azerbaijan', 'Azerbaijan', '🇦🇿', 22),
  ('BS', 'bahamas', 'Bahamas', '🇧🇸', 23),
  ('BH', 'bahrain', 'Bahrain', '🇧🇭', 24),
  ('BD', 'bangladesh', 'Bangladesh', '🇧🇩', 25),
  ('BB', 'barbados', 'Barbados', '🇧🇧', 26),
  ('BE', 'belgium', 'Belgium', '🇧🇪', 27),
  ('BZ', 'belize', 'Belize', '🇧🇿', 28),
  ('BJ', 'benin', 'Benin', '🇧🇯', 29),
  ('BM', 'bermuda', 'Bermuda', '🇧🇲', 30),
  ('BT', 'bhutan', 'Bhutan', '🇧🇹', 31),
  ('BO', 'bolivia', 'Bolivia', '🇧🇴', 32),
  ('BA', 'bosnia-and-herzegovina', 'Bosnia and Herzegovina', '🇧🇦', 33),
  ('BW', 'botswana', 'Botswana', '🇧🇼', 34),
  ('BR', 'brazil', 'Brazil', '🇧🇷', 35),
  ('BN', 'brunei', 'Brunei', '🇧🇳', 36),
  ('BG', 'bulgaria', 'Bulgaria', '🇧🇬', 37),
  ('BF', 'burkina-faso', 'Burkina Faso', '🇧🇫', 38),
  ('BI', 'burundi', 'Burundi', '🇧🇮', 39),
  ('KH', 'cambodia', 'Cambodia', '🇰🇭', 40),
  ('CM', 'cameroon', 'Cameroon', '🇨🇲', 41),
  ('CA', 'canada', 'Canada', '🇨🇦', 42),
  ('CV', 'cape-verde', 'Cape Verde', '🇨🇻', 43),
  ('KY', 'cayman-islands', 'Cayman Islands', '🇰🇾', 44),
  ('TD', 'chad', 'Chad', '🇹🇩', 45),
  ('CL', 'chile', 'Chile', '🇨🇱', 46),
  ('CN', 'china', 'China', '🇨🇳', 47),
  ('CO', 'colombia', 'Colombia', '🇨🇴', 48),
  ('CD', 'congo', 'Congo', '🇨🇩', 49),
  ('CR', 'costa-rica', 'Costa Rica', '🇨🇷', 50),
  ('HR', 'croatia', 'Croatia', '🇭🇷', 51),
  ('CY', 'cyprus', 'Cyprus', '🇨🇾', 52),
  ('CZ', 'czech-republic', 'Czech Republic', '🇨🇿', 53),
  ('DK', 'denmark', 'Denmark', '🇩🇰', 54),
  ('DJ', 'djibouti', 'Djibouti', '🇩🇯', 55),
  ('DM', 'dominica', 'Dominica', '🇩🇲', 56),
  ('DO', 'dominican-republic', 'Dominican Republic', '🇩🇴', 57),
  ('TL', 'timor-leste', 'East Timor', '🇹🇱', 58),
  ('EC', 'ecuador', 'Ecuador', '🇪🇨', 59),
  ('EG', 'egypt', 'Egypt', '🇪🇬', 60),
  ('SV', 'el-salvador', 'El Salvador', '🇸🇻', 61),
  ('EE', 'estonia', 'Estonia', '🇪🇪', 62),
  ('ET', 'ethiopia', 'Ethiopia', '🇪🇹', 63),
  ('XE', 'euro-area', 'Euro Area', '🇪🇺', 64),
  ('EU', 'european-union', 'European Union', '🇪🇺', 65),
  ('FO', 'faroe-islands', 'Faroe Islands', '🇫🇴', 66),
  ('FJ', 'fiji', 'Fiji', '🇫🇯', 67),
  ('FI', 'finland', 'Finland', '🇫🇮', 68),
  ('GA', 'gabon', 'Gabon', '🇬🇦', 69),
  ('GM', 'gambia', 'Gambia', '🇬🇲', 70),
  ('GE', 'georgia', 'Georgia', '🇬🇪', 71),
  ('GH', 'ghana', 'Ghana', '🇬🇭', 72),
  ('GR', 'greece', 'Greece', '🇬🇷', 73),
  ('GD', 'grenada', 'Grenada', '🇬🇩', 74),
  ('GT', 'guatemala', 'Guatemala', '🇬🇹', 75),
  ('GN', 'guinea', 'Guinea', '🇬🇳', 76),
  ('GY', 'guyana', 'Guyana', '🇬🇾', 77),
  ('HT', 'haiti', 'Haiti', '🇭🇹', 78),
  ('HN', 'honduras', 'Honduras', '🇭🇳', 79),
  ('HK', 'hong-kong', 'Hong Kong', '🇭🇰', 80),
  ('HU', 'hungary', 'Hungary', '🇭🇺', 81),
  ('IS', 'iceland', 'Iceland', '🇮🇸', 82),
  ('IN', 'india', 'India', '🇮🇳', 83),
  ('ID', 'indonesia', 'Indonesia', '🇮🇩', 84),
  ('IR', 'iran', 'Iran', '🇮🇷', 85),
  ('IQ', 'iraq', 'Iraq', '🇮🇶', 86),
  ('IL', 'israel', 'Israel', '🇮🇱', 87),
  ('CI', 'cote-d-ivoire', 'Ivory Coast', '🇨🇮', 88),
  ('JM', 'jamaica', 'Jamaica', '🇯🇲', 89),
  ('JO', 'jordan', 'Jordan', '🇯🇴', 90),
  ('KZ', 'kazakhstan', 'Kazakhstan', '🇰🇿', 91),
  ('XK', 'kosovo', 'Kosovo', '🇽🇰', 92),
  ('KW', 'kuwait', 'Kuwait', '🇰🇼', 93),
  ('KG', 'kyrgyzstan', 'Kyrgyzstan', '🇰🇬', 94),
  ('LA', 'laos', 'Laos', '🇱🇦', 95),
  ('LV', 'latvia', 'Latvia', '🇱🇻', 96),
  ('LB', 'lebanon', 'Lebanon', '🇱🇧', 97),
  ('LS', 'lesotho', 'Lesotho', '🇱🇸', 98),
  ('LR', 'liberia', 'Liberia', '🇱🇷', 99),
  ('LY', 'libya', 'Libya', '🇱🇾', 100),
  ('LT', 'lithuania', 'Lithuania', '🇱🇹', 101),
  ('LU', 'luxembourg', 'Luxembourg', '🇱🇺', 102),
  ('MO', 'macau', 'Macau', '🇲🇴', 103),
  ('MK', 'macedonia', 'Macedonia', '🇲🇰', 104),
  ('MG', 'madagascar', 'Madagascar', '🇲🇬', 105),
  ('MW', 'malawi', 'Malawi', '🇲🇼', 106),
  ('MY', 'malaysia', 'Malaysia', '🇲🇾', 107),
  ('MV', 'maldives', 'Maldives', '🇲🇻', 108),
  ('ML', 'mali', 'Mali', '🇲🇱', 109),
  ('MT', 'malta', 'Malta', '🇲🇹', 110),
  ('MR', 'mauritania', 'Mauritania', '🇲🇷', 111),
  ('MU', 'mauritius', 'Mauritius', '🇲🇺', 112),
  ('MX', 'mexico', 'Mexico', '🇲🇽', 113),
  ('MD', 'moldova', 'Moldova', '🇲🇩', 114),
  ('MN', 'mongolia', 'Mongolia', '🇲🇳', 115),
  ('ME', 'montenegro', 'Montenegro', '🇲🇪', 116),
  ('MA', 'morocco', 'Morocco', '🇲🇦', 117),
  ('MZ', 'mozambique', 'Mozambique', '🇲🇿', 118),
  ('NA', 'namibia', 'Namibia', '🇳🇦', 119),
  ('NP', 'nepal', 'Nepal', '🇳🇵', 120),
  ('NL', 'netherlands', 'Netherlands', '🇳🇱', 121),
  ('NC', 'new-caledonia', 'New Caledonia', '🇳🇨', 122),
  ('NZ', 'new-zealand', 'New Zealand', '🇳🇿', 123),
  ('NI', 'nicaragua', 'Nicaragua', '🇳🇮', 124),
  ('NE', 'niger', 'Niger', '🇳🇪', 125),
  ('NG', 'nigeria', 'Nigeria', '🇳🇬', 126),
  ('NO', 'norway', 'Norway', '🇳🇴', 127),
  ('OM', 'oman', 'Oman', '🇴🇲', 128),
  ('PK', 'pakistan', 'Pakistan', '🇵🇰', 129),
  ('PS', 'palestine', 'Palestine', '🇵🇸', 130),
  ('PA', 'panama', 'Panama', '🇵🇦', 131),
  ('PG', 'papua-new-guinea', 'Papua New Guinea', '🇵🇬', 132),
  ('PY', 'paraguay', 'Paraguay', '🇵🇾', 133),
  ('PE', 'peru', 'Peru', '🇵🇪', 134),
  ('PH', 'philippines', 'Philippines', '🇵🇭', 135),
  ('PL', 'poland', 'Poland', '🇵🇱', 136),
  ('PT', 'portugal', 'Portugal', '🇵🇹', 137),
  ('PR', 'puerto-rico', 'Puerto Rico', '🇵🇷', 138),
  ('QA', 'qatar', 'Qatar', '🇶🇦', 139),
  ('CG', 'republic-of-the-congo', 'Republic of the Congo', '🇨🇬', 140),
  ('RO', 'romania', 'Romania', '🇷🇴', 141),
  ('RU', 'russia', 'Russia', '🇷🇺', 142),
  ('RW', 'rwanda', 'Rwanda', '🇷🇼', 143),
  ('ST', 'sao-tome-and-principe', 'Sao Tome And Principe', '🇸🇹', 144),
  ('SA', 'saudi-arabia', 'Saudi Arabia', '🇸🇦', 145),
  ('SN', 'senegal', 'Senegal', '🇸🇳', 146),
  ('RS', 'serbia', 'Serbia', '🇷🇸', 147),
  ('SC', 'seychelles', 'Seychelles', '🇸🇨', 148),
  ('SL', 'sierra-leone', 'Sierra Leone', '🇸🇱', 149),
  ('SK', 'slovakia', 'Slovakia', '🇸🇰', 150),
  ('SI', 'slovenia', 'Slovenia', '🇸🇮', 151),
  ('SB', 'solomon-islands', 'Solomon Islands', '🇸🇧', 152),
  ('SO', 'somalia', 'Somalia', '🇸🇴', 153),
  ('KR', 'south-korea', 'South Korea', '🇰🇷', 154),
  ('ES', 'spain', 'Spain', '🇪🇸', 155),
  ('LK', 'sri-lanka', 'Sri Lanka', '🇱🇰', 156),
  ('KN', 'st-kitts-and-nevis', 'St Kitts and Nevis', '🇰🇳', 157),
  ('LC', 'st-lucia', 'St Lucia', '🇱🇨', 158),
  ('SR', 'suriname', 'Suriname', '🇸🇷', 159),
  ('SZ', 'swaziland', 'Swaziland', '🇸🇿', 160),
  ('SE', 'sweden', 'Sweden', '🇸🇪', 161),
  ('CH', 'switzerland', 'Switzerland', '🇨🇭', 162),
  ('SY', 'syria', 'Syria', '🇸🇾', 163),
  ('TW', 'taiwan', 'Taiwan', '🇹🇼', 164),
  ('TJ', 'tajikistan', 'Tajikistan', '🇹🇯', 165),
  ('TZ', 'tanzania', 'Tanzania', '🇹🇿', 166),
  ('TH', 'thailand', 'Thailand', '🇹🇭', 167),
  ('TG', 'togo', 'Togo', '🇹🇬', 168),
  ('TT', 'trinidad-and-tobago', 'Trinidad And Tobago', '🇹🇹', 169),
  ('TN', 'tunisia', 'Tunisia', '🇹🇳', 170),
  ('TR', 'turkey', 'Turkey', '🇹🇷', 171),
  ('UG', 'uganda', 'Uganda', '🇺🇬', 172),
  ('UA', 'ukraine', 'Ukraine', '🇺🇦', 173),
  ('AE', 'united-arab-emirates', 'United Arab Emirates', '🇦🇪', 174),
  ('UY', 'uruguay', 'Uruguay', '🇺🇾', 175),
  ('VU', 'vanuatu', 'Vanuatu', '🇻🇺', 176),
  ('VE', 'venezuela', 'Venezuela', '🇻🇪', 177),
  ('VN', 'vietnam', 'Vietnam', '🇻🇳', 178),
  ('ZM', 'zambia', 'Zambia', '🇿🇲', 179)
ON CONFLICT (code) DO NOTHING;
