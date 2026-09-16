import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getIndicatorDetail } from "@/db/queries";
import { isDbConfigured } from "@/db/client";
import { LineChart } from "@/components/line-chart";
import { DeltaBadge } from "@/components/delta-badge";
import { DbNotConfigured } from "@/components/state-messages";
import { countryColor } from "@/lib/colors";
import { categoryLabel } from "@/lib/categories";
import { formatPeriod, formatScrapedAt, formatValue } from "@/lib/format";

export const revalidate = 3600;

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
        href={`/${country}#${meta.category}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to {meta.countryName}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <span aria-hidden>{meta.flagEmoji}</span> {meta.countryName} · {categoryLabel(meta.category)}
          </p>
          <h1 className="text-2xl font-semibold">{meta.name}</h1>
        </div>
        <a
          href={`https://tradingeconomics.com${meta.sourcePath}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Source on TradingEconomics
        </a>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Last" value={formatValue(latest?.lastValue ?? null, meta.unit)} />
        <Stat label="Previous" value={formatValue(latest?.previousValue ?? null, meta.unit)} />
        <Stat label="Highest" value={formatValue(latest?.highestValue ?? null, meta.unit)} />
        <Stat label="Lowest" value={formatValue(latest?.lowestValue ?? null, meta.unit)} />
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">History since tracking began</h2>
          <DeltaBadge last={latest?.lastValue ?? null} previous={latest?.previousValue ?? null} />
        </div>
        <LineChart points={points} color={color} unit={meta.unit} />
      </div>

      {latest && <p className="mt-4 text-xs text-muted-foreground">Last scraped {formatScrapedAt(latest.scrapedAt)}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
