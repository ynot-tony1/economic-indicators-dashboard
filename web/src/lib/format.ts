export function formatValue(value: string | null, unit: string | null): string {
  if (value === null || value === undefined) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(num) < 10 ? 2 : Math.abs(num) < 1000 ? 1 : 0,
  }).format(num);
  const shortUnit = unit && unit.toLowerCase() === "percent" ? "%" : unit;
  return shortUnit ? `${formatted} ${shortUnit}` : formatted;
}

export function formatDelta(last: string | null, previous: string | null): {
  direction: "up" | "down" | "flat" | "none";
  label: string;
} {
  if (last === null || previous === null) return { direction: "none", label: "" };
  const l = Number(last);
  const p = Number(previous);
  if (Number.isNaN(l) || Number.isNaN(p)) return { direction: "none", label: "" };
  const diff = l - p;
  if (diff === 0) return { direction: "flat", label: "0" };
  const direction = diff > 0 ? "up" : "down";
  const label = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, signDisplay: "always" }).format(diff);
  return { direction, label };
}

export function formatPeriod(rawPeriod: string | null, periodDate: string | null): string {
  if (rawPeriod) return rawPeriod;
  if (periodDate) return new Date(periodDate).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return "—";
}

export function formatScrapedAt(scrapedAt: string): string {
  return new Date(scrapedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
