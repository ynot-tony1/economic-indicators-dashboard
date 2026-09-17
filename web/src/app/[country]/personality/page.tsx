import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCountries, getCountryBySlug, getCountryPersonality } from "@/db/queries";
import { isDbConfigured } from "@/db/client";
import { CountrySelect } from "@/components/country-select";
import { SectionTabs } from "@/components/section-tabs";
import { DbNotConfigured } from "@/components/state-messages";
import { RadarChart } from "@/components/radar-chart";
import { TraitList } from "@/components/trait-list";
import { countryColor } from "@/lib/colors";
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

export async function generateMetadata({ params }: PageProps<"/[country]/personality">): Promise<Metadata> {
  const { country } = await params;
  const activeCountry = await getCountryBySlug(country);
  return { title: activeCountry ? `${activeCountry.name} · Personality` : "Personality" };
}

export default async function PersonalityPage({ params }: PageProps<"/[country]/personality">) {
  const { country } = await params;

  if (!isDbConfigured) {
    return <DbNotConfigured />;
  }

  const [countries, activeCountry, personality] = await Promise.all([
    getCountries(),
    getCountryBySlug(country),
    getCountryPersonality(country),
  ]);

  if (!activeCountry) notFound();

  const color = countryColor(country);
  const traits = personality?.traits ?? [];
  const persona = personality?.persona ?? null;

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
            <p className="mt-2 text-sm text-muted-foreground">Market Personality</p>
          </div>
          <div className="w-full sm:w-64">
            <CountrySelect countries={countries} activeSlug={country} />
          </div>
        </div>
        <SectionTabs countrySlug={country} active="personality" />
      </div>

      {traits.length === 0 ? (
        <div className="mt-16 text-center">
          <h2 className="text-lg font-medium">No personality generated yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This country&apos;s market personality hasn&apos;t been generated yet. It runs alongside the nightly
            scrape.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-2">
          <div>
            {persona && (
              <div
                className="border-l-2 pl-4 [border-left-color:var(--accent-light)] dark:[border-left-color:var(--accent-dark)]"
                style={{ "--accent-light": color.light, "--accent-dark": color.dark } as React.CSSProperties}
              >
                <h2 className="text-2xl font-semibold tracking-tight">{persona.archetypeTitle}</h2>
                <p className="mt-3 text-muted-foreground leading-relaxed">{persona.narrative}</p>
                <p className="mt-4 text-xs text-muted-foreground">
                  Generated {formatScrapedAt(persona.generatedAt)}
                </p>
              </div>
            )}
            <div className="mt-8">
              <RadarChart traits={traits} color={color} />
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">Traits</h2>
            <TraitList traits={traits} color={color} />
          </div>
        </div>
      )}
    </div>
  );
}
