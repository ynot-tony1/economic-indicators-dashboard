// Categorical slots from the dashboard's validated palette (dataviz skill).
// Fixed per-country assignment so a country's color never shifts between views.
export const COUNTRY_COLORS: Record<string, { light: string; dark: string }> = {
  "united-states": { light: "#2a78d6", dark: "#3987e5" }, // blue
  japan: { light: "#eb6834", dark: "#d95926" }, // orange
  "united-kingdom": { light: "#4a3aa7", dark: "#9085e9" }, // violet
  france: { light: "#e87ba4", dark: "#d55181" }, // magenta
  germany: { light: "#eda100", dark: "#c98500" }, // gold
  ireland: { light: "#008300", dark: "#008300" }, // green
  kenya: { light: "#e34948", dark: "#e66767" }, // red
  "south-africa": { light: "#1baf7a", dark: "#199e70" }, // aqua
};

export const DEFAULT_SERIES_COLOR = { light: "#2a78d6", dark: "#3987e5" };

export function countryColor(slug: string): { light: string; dark: string } {
  return COUNTRY_COLORS[slug] ?? DEFAULT_SERIES_COLOR;
}

// Fixed status palette — never reused for series identity.
export const STATUS = {
  good: { light: "#0ca30c", dark: "#0ca30c" },
  critical: { light: "#d03b3b", dark: "#e66767" },
};
