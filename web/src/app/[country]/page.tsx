import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCountries, getCountryBySlug, getLatestIndicators } from "@/db/queries";
import { isDbConfigured } from "@/db/client";
import { CountryNav } from "@/components/country-nav";
import { CategoryQuickNav } from "@/components/category-quick-nav";
import { IndicatorCard } from "@/components/indicator-card";
import { DbNotConfigured, EmptyState } from "@/components/state-messages";
import { categoryLabel, sortCategories } from "@/lib/categories";
import { formatScrapedAt } from "@/lib/format";

export const revalidate = 3600;

const KNOWN_COUNTRIES = ["united-states", "united-kingdom", "japan"];

export function generateStaticParams() {
  return KNOWN_COUNTRIES.map((country) => ({ country }));
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
    <div>
      <div className="mx-auto max-w-6xl px-6 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
              <span className="text-3xl leading-none" aria-hidden>
                {activeCountry.flagEmoji}
              </span>
              {activeCountry.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>
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
          <CountryNav countries={countries} activeSlug={country} />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="mt-6">
            <CategoryQuickNav categories={categories} counts={counts} />
          </div>
          <div className="mx-auto max-w-6xl space-y-12 px-6 py-8">
            {categories.map((category) => (
              <section key={category} id={category} className="scroll-mt-28">
                <div className="mb-4 flex items-baseline gap-2 border-b pb-2">
                  <h2 className="text-base font-semibold tracking-tight">{categoryLabel(category)}</h2>
                  <span className="text-xs tabular-nums text-muted-foreground">{counts[category]}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {rows
                    .filter((r) => r.category === category)
                    .map((row) => (
                      <IndicatorCard key={row.id} countrySlug={country} row={row} />
                    ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
