export const CATEGORY_LABELS: Record<string, string> = {
  gdp: "GDP",
  labour: "Labour",
  prices: "Prices",
  money: "Money",
  trade: "Trade",
  government: "Government",
  business: "Business",
  consumer: "Consumer",
  housing: "Housing",
  energy: "Energy",
  health: "Health",
  taxes: "Taxes",
  climate: "Climate",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

/** Fixed display order; anything unrecognized is appended alphabetically at the end. */
export const CATEGORY_ORDER = [
  "gdp",
  "labour",
  "prices",
  "money",
  "trade",
  "government",
  "business",
  "consumer",
  "housing",
  "energy",
  "health",
  "taxes",
  "climate",
];

export function sortCategories(categories: string[]): string[] {
  return [...new Set(categories)].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
