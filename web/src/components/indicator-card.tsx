import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeltaBadge } from "@/components/delta-badge";
import { formatPeriod, formatValue } from "@/lib/format";
import type { LatestIndicatorRow } from "@/db/queries";

export function IndicatorCard({ countrySlug, row }: { countrySlug: string; row: LatestIndicatorRow }) {
  return (
    <Link href={`/${countrySlug}/${row.slug}`} className="group">
      <Card className="h-full transition-shadow group-hover:shadow-md group-hover:ring-foreground/20">
        <CardHeader>
          <CardTitle className="line-clamp-2">{row.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-semibold tabular-nums">{formatValue(row.lastValue, row.unit)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{formatPeriod(row.rawPeriod, row.periodDate)}</div>
          </div>
          <DeltaBadge last={row.lastValue} previous={row.previousValue} />
        </CardContent>
      </Card>
    </Link>
  );
}
