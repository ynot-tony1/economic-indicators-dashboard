import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getIndicatorDetail } from "@/db/queries";
import { isDbConfigured } from "@/db/client";
import { LineChart } from "@/components/line-chart";
import { DeltaBadge } from "@/components/delta-badge";
import { RangeGauge } from "@/components/range-gauge";
import { Badge } from "@/components/ui/badge";
import { DbNotConfigured } from "@/components/state-messages";
import { countryColor } from "@/lib/colors";
import { categoryLabel } from "@/lib/categories";
import { formatPeriod, formatSnapshotDate, formatValue } from "@/lib/format";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: PageProps<"/[country]/[indicator]">): Promise<Metadata> {
  const { country, indicator } = await params;
  const detail = await getIndicatorDetail(country, indicator);
  if (!detail) return {};
  return { title: `${detail.indicator.name} · ${detail.indicator.countryName}` };
}

export default async function IndicatorPage({ params }: PageProps<"/[country]/[indicator]">) {
  const { country, indicator } = await params;

  if (!isDbConfigured) {
    return <DbNotConfigured />;
  }

  const detail = await getIndicatorDetail(country, indicator);
  if (!detail) notFound();

  const { indicator: meta, history } = detail;
  const latest = history[history.length - 1] ?? null;
  const color = countryColor(country);

  const points = history
    .filter((h) => h.lastValue !== null)
    .map((h) => ({
      date: h.scrapedAt,
      value: Number(h.lastValue),
      period: formatPeriod(h.rawPeriod, h.periodDate),
    }));

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href={`/${country}?category=${meta.category}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to {meta.countryName}
      </Link>

      <div
        className="mt-4 flex flex-wrap items-start justify-between gap-4 border-l-2 pl-4 [border-left-color:var(--accent-light)] dark:[border-left-color:var(--accent-dark)]"
        style={{ "--accent-light": color.light, "--accent-dark": color.dark } as React.CSSProperties}
      >
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden>{meta.flagEmoji}</span>
            <span>{meta.countryName}</span>
            <Badge
              variant="outline"
              className="[background-color:color-mix(in_oklch,var(--accent-light)_12%,transparent)] [border-color:color-mix(in_oklch,var(--accent-light)_35%,transparent)] [color:var(--accent-light)] dark:[background-color:color-mix(in_oklch,var(--accent-dark)_16%,transparent)] dark:[border-color:color-mix(in_oklch,var(--accent-dark)_40%,transparent)] dark:[color:var(--accent-dark)]"
            >
              {categoryLabel(meta.category)}
            </Badge>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{meta.name}</h1>
        </div>
        <a
          href={`https://tradingeconomics.com${meta.sourcePath}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          TradingEconomics <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Last" value={formatValue(latest?.lastValue ?? null, meta.unit)} emphasis />
        <Stat label="Previous" value={formatValue(latest?.previousValue ?? null, meta.unit)} />
        <Stat label="Highest" value={formatValue(latest?.highestValue ?? null, meta.unit)} />
        <Stat label="Lowest" value={formatValue(latest?.lowestValue ?? null, meta.unit)} />
      </div>

      <RangeGauge
        last={latest?.lastValue ?? null}
        low={latest?.lowestValue ?? null}
        high={latest?.highestValue ?? null}
        color={color}
      />

      <div className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">History since tracking began</h2>
          <DeltaBadge last={latest?.lastValue ?? null} previous={latest?.previousValue ?? null} />
        </div>
        <LineChart points={points} color={color} unit={meta.unit} />
      </div>

      {latest && <p className="mt-4 text-xs text-muted-foreground">Last updated {formatSnapshotDate(latest.scrapedAt)}</p>}
    </div>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${emphasis ? "bg-muted/50" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-medium tabular-nums">{value}</div>
    </div>
  );
}
