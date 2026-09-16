import { notFound } from "next/navigation";
import { getCountries, getCountryBySlug, getLatestIndicators } from "@/db/queries";
import { isDbConfigured } from "@/db/client";
import { CountryNav } from "@/components/country-nav";
import { IndicatorCard } from "@/components/indicator-card";
import { DbNotConfigured, EmptyState } from "@/components/state-messages";
import { categoryLabel, sortCategories } from "@/lib/categories";
import { formatScrapedAt } from "@/lib/format";

export const revalidate = 3600;

const KNOWN_COUNTRIES = ["united-states", "united-kingdom", "japan"];

export function generateStaticParams() {
  return KNOWN_COUNTRIES.map((country) => ({ country }));
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
  const latestScrapedAt = rows[0]?.scrapedAt;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            <span aria-hidden>{activeCountry.flagEmoji}</span> {activeCountry.name}
          </h1>
          {latestScrapedAt && (
            <p className="mt-1 text-sm text-muted-foreground">Last updated {formatScrapedAt(latestScrapedAt)}</p>
          )}
        </div>
        <CountryNav countries={countries} activeSlug={country} />
      </div>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-8 space-y-10">
          {categories.map((category) => (
            <section key={category} id={category} className="scroll-mt-6">
              <h2 className="mb-3 text-lg font-medium">{categoryLabel(category)}</h2>
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
      )}
    </div>
  );
}
