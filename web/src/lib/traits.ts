// Mirrors TRAITS in scraper/insights.py — keep the slugs, names, and pole
// labels in sync with that file; only the wording lives twice.
export const TRAIT_ORDER = ["assertiveness", "composure", "drive", "discipline", "independence"] as const;

export type TraitSlug = (typeof TRAIT_ORDER)[number];

export const TRAIT_META: Record<TraitSlug, { name: string; poleLow: string; poleHigh: string }> = {
  assertiveness: { name: "Assertiveness", poleLow: "Reserved", poleHigh: "Assertive" },
  composure: { name: "Composure", poleLow: "Anxious", poleHigh: "Composed" },
  drive: { name: "Drive", poleLow: "Sluggish", poleHigh: "Ambitious" },
  discipline: { name: "Discipline", poleLow: "Reckless", poleHigh: "Disciplined" },
  independence: { name: "Independence", poleLow: "Dependent", poleHigh: "Self-Reliant" },
};

export function sortTraits<T extends { trait: string }>(traits: T[]): T[] {
  return [...traits].sort((a, b) => TRAIT_ORDER.indexOf(a.trait as TraitSlug) - TRAIT_ORDER.indexOf(b.trait as TraitSlug));
}
