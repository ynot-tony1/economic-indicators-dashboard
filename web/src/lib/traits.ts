// Mirrors TRAITS in scraper/insights.py — keep the slugs, names, pole labels,
// and metrics in sync with that file; only the wording lives twice.
export const TRAIT_ORDER = ["assertiveness", "composure", "drive", "discipline", "independence"] as const;

export type TraitSlug = (typeof TRAIT_ORDER)[number];

export type TraitMetric = { name: string; direction: "higher" | "lower" };

// `metrics` mirrors each trait's `metrics` in scraper/insights.py: the only
// indicators that feed the score, and which direction pushes toward poleHigh.
export const TRAIT_META: Record<
  TraitSlug,
  { name: string; poleLow: string; poleHigh: string; metrics: TraitMetric[] }
> = {
  assertiveness: {
    name: "Assertiveness",
    poleLow: "Reserved",
    poleHigh: "Assertive",
    metrics: [{ name: "GDP", direction: "higher" }],
  },
  composure: {
    name: "Composure",
    poleLow: "Anxious",
    poleHigh: "Composed",
    metrics: [
      { name: "Inflation Rate", direction: "lower" },
      { name: "Unemployment Rate", direction: "lower" },
    ],
  },
  drive: {
    name: "Drive",
    poleLow: "Sluggish",
    poleHigh: "Ambitious",
    metrics: [{ name: "GDP Annual Growth Rate", direction: "higher" }],
  },
  discipline: {
    name: "Discipline",
    poleLow: "Reckless",
    poleHigh: "Disciplined",
    metrics: [
      { name: "Government Debt to GDP", direction: "lower" },
      { name: "Government Budget", direction: "higher" },
    ],
  },
  independence: {
    name: "Independence",
    poleLow: "Dependent",
    poleHigh: "Self-Reliant",
    metrics: [{ name: "Current Account to GDP", direction: "higher" }],
  },
};

export function sortTraits<T extends { trait: string }>(traits: T[]): T[] {
  return [...traits].sort((a, b) => TRAIT_ORDER.indexOf(a.trait as TraitSlug) - TRAIT_ORDER.indexOf(b.trait as TraitSlug));
}
