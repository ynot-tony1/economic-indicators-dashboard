import { formatNumber } from "@/lib/format";

export function RangeGauge({
  last,
  low,
  high,
  color,
}: {
  last: string | null;
  low: string | null;
  high: string | null;
  color: { light: string; dark: string };
}) {
  if (last === null || low === null || high === null) return null;
  const l = Number(low);
  const h = Number(high);
  const v = Number(last);
  if (Number.isNaN(l) || Number.isNaN(h) || Number.isNaN(v) || h === l) return null;

  const pct = Math.min(100, Math.max(0, ((v - l) / (h - l)) * 100));

  return (
    <div
      className="mt-3 space-y-1"
      style={{ "--gauge-light": color.light, "--gauge-dark": color.dark } as React.CSSProperties}
    >
      <div className="relative h-1 rounded-full bg-foreground/10">
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card [background-color:var(--gauge-light)] dark:[background-color:var(--gauge-dark)]"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{formatNumber(low)}</span>
        <span>{formatNumber(high)}</span>
      </div>
    </div>
  );
}
