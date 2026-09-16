import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { countries, indicatorSnapshots, indicators } from "./schema";

export type LatestIndicatorRow = {
  id: string;
  category: string;
  slug: string;
  name: string;
  unit: string | null;
  sourcePath: string;
  lastValue: string | null;
  previousValue: string | null;
  highestValue: string | null;
  lowestValue: string | null;
  periodDate: string | null;
  rawPeriod: string | null;
  scrapedAt: string;
};

export async function getCountries() {
  if (!db) return [];
  return db.select().from(countries).orderBy(asc(countries.sortOrder));
}

export async function getCountryBySlug(slug: string) {
  if (!db) return null;
  const rows = await db.select().from(countries).where(eq(countries.slug, slug)).limit(1);
  return rows[0] ?? null;
}

/** Most recent snapshot for every indicator belonging to a country, newest scrape first. */
export async function getLatestIndicators(countrySlug: string): Promise<LatestIndicatorRow[]> {
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT DISTINCT ON (i.id)
      i.id AS id,
      i.category AS category,
      i.slug AS slug,
      i.name AS name,
      i.unit AS unit,
      i.source_path AS "sourcePath",
      s.last_value AS "lastValue",
      s.previous_value AS "previousValue",
      s.highest_value AS "highestValue",
      s.lowest_value AS "lowestValue",
      s.period_date AS "periodDate",
      s.raw_period AS "rawPeriod",
      s.scraped_at AS "scrapedAt"
    FROM indicators i
    JOIN countries c ON c.id = i.country_id
    JOIN indicator_snapshots s ON s.indicator_id = i.id
    WHERE c.slug = ${countrySlug}
    ORDER BY i.id, s.scraped_at DESC
  `);
  const rows = result.rows as unknown as LatestIndicatorRow[];
  return rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export type SnapshotPoint = {
  scrapedAt: string;
  periodDate: string | null;
  rawPeriod: string | null;
  lastValue: string | null;
  previousValue: string | null;
  highestValue: string | null;
  lowestValue: string | null;
};

export type IndicatorDetail = {
  id: string;
  category: string;
  slug: string;
  name: string;
  unit: string | null;
  sourcePath: string;
  countryName: string;
  countrySlug: string;
  flagEmoji: string;
};

export async function getIndicatorDetail(
  countrySlug: string,
  indicatorSlug: string,
): Promise<{ indicator: IndicatorDetail; history: SnapshotPoint[] } | null> {
  if (!db) return null;

  const rows = await db
    .select({
      id: indicators.id,
      category: indicators.category,
      slug: indicators.slug,
      name: indicators.name,
      unit: indicators.unit,
      sourcePath: indicators.sourcePath,
      countryName: countries.name,
      countrySlug: countries.slug,
      flagEmoji: countries.flagEmoji,
    })
    .from(indicators)
    .innerJoin(countries, eq(countries.id, indicators.countryId))
    .where(and(eq(countries.slug, countrySlug), eq(indicators.slug, indicatorSlug)))
    .limit(1);

  const indicator = rows[0];
  if (!indicator) return null;

  const history = await db
    .select({
      scrapedAt: indicatorSnapshots.scrapedAt,
      periodDate: indicatorSnapshots.periodDate,
      rawPeriod: indicatorSnapshots.rawPeriod,
      lastValue: indicatorSnapshots.lastValue,
      previousValue: indicatorSnapshots.previousValue,
      highestValue: indicatorSnapshots.highestValue,
      lowestValue: indicatorSnapshots.lowestValue,
    })
    .from(indicatorSnapshots)
    .where(eq(indicatorSnapshots.indicatorId, indicator.id))
    .orderBy(asc(indicatorSnapshots.scrapedAt));

  return { indicator, history: history as unknown as SnapshotPoint[] };
}
