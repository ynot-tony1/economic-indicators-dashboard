import Link from "next/link";
import { getCountries } from "@/db/queries";
import { isDbConfigured } from "@/db/client";
import { CountrySelect } from "@/components/country-select";
import { DbNotConfigured } from "@/components/state-messages";

export const revalidate = 3600;

const FEATURED_SLUGS = [
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

export default async function Home() {
  if (!isDbConfigured) {
    return <DbNotConfigured />;
  }

  const countries = await getCountries();
  const featured = FEATURED_SLUGS.map((slug) => countries.find((c) => c.slug === slug)).filter(
    (c): c is (typeof countries)[number] => Boolean(c),
  );
  const rest = countries.filter((c) => !FEATURED_SLUGS.includes(c.slug));

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Market Personalities</h1>
        <p className="mt-3 text-muted-foreground">
          Nightly-refreshed indicators and market personalities for {countries.length} countries, sourced from
          TradingEconomics.
        </p>
        <div className="mx-auto mt-8 max-w-md">
          <CountrySelect countries={countries} size="large" />
        </div>
      </div>

      {featured.length > 0 && (
        <div className="mt-16">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Featured</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {featured.map((c) => (
              <Link
                key={c.slug}
                href={`/${c.slug}/personality`}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:border-foreground/30"
              >
                <span className="text-lg leading-none" aria-hidden>
                  {c.flagEmoji}
                </span>
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">
            All {countries.length} tracked countries
          </h2>
          <div className="columns-2 gap-x-6 sm:columns-3 md:columns-4">
            {countries.map((c) => (
              <Link
                key={c.slug}
                href={`/${c.slug}/personality`}
                className="flex items-center gap-2 break-inside-avoid py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <span aria-hidden>{c.flagEmoji}</span>
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
