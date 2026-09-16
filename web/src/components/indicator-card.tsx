import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeltaBadge } from "@/components/delta-badge";
import { RangeGauge } from "@/components/range-gauge";
import { countryColor } from "@/lib/colors";
import { formatPeriod, formatValue } from "@/lib/format";
import type { LatestIndicatorRow } from "@/db/queries";

export function IndicatorCard({ countrySlug, row }: { countrySlug: string; row: LatestIndicatorRow }) {
  const color = countryColor(countrySlug);

  return (
    <Link href={`/${countrySlug}/${row.slug}`} className="group block">
      <Card
        className="h-full border-border/70 bg-card transition-colors group-hover:border-[color-mix(in_oklch,var(--accent-light)_45%,var(--border))] dark:group-hover:border-[color-mix(in_oklch,var(--accent-dark)_45%,var(--border))]"
        style={{ "--accent-light": color.light, "--accent-dark": color.dark } as React.CSSProperties}
      >
        <CardHeader>
          <CardTitle className="line-clamp-2 text-[13px] leading-snug text-muted-foreground group-hover:text-foreground">
            {row.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="font-mono text-2xl font-medium tabular-nums">{formatValue(row.lastValue, row.unit)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{formatPeriod(row.rawPeriod, row.periodDate)}</div>
            </div>
            <DeltaBadge last={row.lastValue} previous={row.previousValue} />
          </div>
          <RangeGauge last={row.lastValue} low={row.lowestValue} high={row.highestValue} color={color} />
        </CardContent>
      </Card>
    </Link>
  );
}
