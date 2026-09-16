import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const countries = pgTable("countries", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  flagEmoji: text("flag_emoji").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const indicators = pgTable(
  "indicators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id),
    category: text("category").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    unit: text("unit"),
    sourcePath: text("source_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("indicators_country_slug").on(table.countryId, table.slug)],
);

export const indicatorSnapshots = pgTable(
  "indicator_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    indicatorId: uuid("indicator_id")
      .notNull()
      .references(() => indicators.id),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
    periodDate: date("period_date"),
    rawPeriod: text("raw_period"),
    lastValue: numeric("last_value"),
    previousValue: numeric("previous_value"),
    highestValue: numeric("highest_value"),
    lowestValue: numeric("lowest_value"),
  },
  (table) => [uniqueIndex("snapshots_indicator_scraped_at").on(table.indicatorId, table.scrapedAt)],
);
