import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCountries, getCountryBySlug, getLatestIndicators } from "@/db/queries";
import { isDbConfigured } from "@/db/client";
import { CountrySelect } from "@/components/country-select";
import { SectionTabs } from "@/components/section-tabs";
import { IndicatorCategoryBrowser } from "@/components/indicator-category-browser";
import { DbNotConfigured, EmptyState } from "@/components/state-messages";
import { sortCategories } from "@/lib/categories";
import { formatScrapedAt } from "@/lib/format";

export const revalidate = 3600;

// Only the original "featured" 12 are pre-rendered at build time (keeps
// builds fast with 179 tracked countries) - every other country still works,
// it just renders on first request and is then cached via ISR (revalidate above).
const FEATURED_COUNTRIES = [
  "united-states",
  "united-kingdom",
  "japan",
  "france",
  "germany",
  "ireland",
  "kenya",
  "south-africa",
  "italy",
  "zimbabwe",
  "australia",
  "singapore",
];

export function generateStaticParams() {
  return FEATURED_COUNTRIES.map((country) => ({ country }));
}

export async function generateMetadata({ params }: PageProps<"/[country]">): Promise<Metadata> {
  const { country } = await params;
  const activeCountry = await getCountryBySlug(country);
  return { title: activeCountry?.name ?? "Country" };
}

export default async function CountryPage({ params }: PageProps<"/[country]">) {
  const { country } = await params;

  if (!isDbConfigured) {
    return <DbNotConfigured />;
  }

  const [countries, activeCountry, rows] = await Promise.all([
    getCountries(),
    getCountryBySlug(country),
    getLatestIndicators(country),
  ]);

  if (!activeCountry) notFound();

  const categories = sortCategories(rows.map((r) => r.category));
  const counts = categories.reduce<Record<string, number>>((acc, category) => {
    acc[category] = rows.filter((r) => r.category === category).length;
    return acc;
  }, {});
  const latestScrapedAt = rows.reduce<string | null>(
    (latest, r) => (!latest || r.scrapedAt > latest ? r.scrapedAt : latest),
    null,
  );

  return (
    <div className="mx-auto max-w-6xl px-6">
      <div className="pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
              <span className="text-3xl leading-none" aria-hidden>
                {activeCountry.flagEmoji}
              </span>
              {activeCountry.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="font-mono tabular-nums">
                {rows.length} indicators, {categories.length} categories
              </span>
              {latestScrapedAt && (
                <>
                  <span className="h-3 w-px bg-border" aria-hidden />
                  <span>Updated {formatScrapedAt(latestScrapedAt)}</span>
                </>
              )}
            </div>
          </div>
          <div className="w-full sm:w-64">
            <CountrySelect countries={countries} activeSlug={country} />
          </div>
        </div>
        <SectionTabs countrySlug={country} active="overview" />
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <IndicatorCategoryBrowser countrySlug={country} rows={rows} categories={categories} counts={counts} />
      )}
    </div>
  );
}
