"use client";

import { useMemo, useState } from "react";

type HistoryPoint = {
  date: string;
  value: number;
  period: string;
};

const VB_W = 640;
const VB_H = 240;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 48 };

export function LineChart({
  points,
  color,
  unit,
}: {
  points: HistoryPoint[];
  color: { light: string; dark: string };
  unit: string | null;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const innerW = VB_W - MARGIN.left - MARGIN.right;
  const innerH = VB_H - MARGIN.top - MARGIN.bottom;

  const { xs, ys, yMin, yMax } = useMemo(() => {
    if (points.length === 0) return { xs: [], ys: [], yMin: 0, yMax: 0 };
    const values = points.map((p) => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
      min -= pad;
      max += pad;
    } else {
      const pad = (max - min) * 0.12;
      min -= pad;
      max += pad;
    }
    const xs = points.map((_, i) =>
      points.length === 1 ? MARGIN.left + innerW / 2 : MARGIN.left + (i / (points.length - 1)) * innerW,
    );
    const ys = points.map((p) => MARGIN.top + innerH - ((p.value - min) / (max - min)) * innerH);
    return { xs, ys, yMin: min, yMax: max };
  }, [points, innerW, innerH]);

  if (points.length === 0) {
    return (
      <div className="flex h-60 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No history yet
      </div>
    );
  }

  if (points.length === 1) {
    return (
      <div className="flex h-60 flex-col items-center justify-center gap-2 rounded-lg border border-dashed">
        <span className="text-3xl font-semibold tabular-nums">
          {points[0].value}
          {unit ? <span className="ml-1 text-base text-muted-foreground">{unit}</span> : null}
        </span>
        <span className="text-sm text-muted-foreground">
          First snapshot captured — history builds up with each nightly scrape.
        </span>
      </div>
    );
  }

  const linePath = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${ys[i].toFixed(2)}`).join(" ");
  const gridLines = [0, 0.5, 1].map((t) => MARGIN.top + innerH * t);
  const gridLabels = [yMax, (yMax + yMin) / 2, yMin];

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? xs[hoverIndex] : null;
  const hoverY = hoverIndex !== null ? ys[hoverIndex] : null;

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VB_W;
    let nearest = 0;
    let nearestDist = Infinity;
    xs.forEach((x, i) => {
      const d = Math.abs(x - px);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full"
        style={
          {
            "--series-light": color.light,
            "--series-dark": color.dark,
          } as React.CSSProperties
        }
      >
        <style>{`
          .series-stroke { stroke: var(--series-light); }
          .series-fill { fill: var(--series-light); }
          .dark .series-stroke { stroke: var(--series-dark); }
          .dark .series-fill { fill: var(--series-dark); }
        `}</style>

        {gridLines.map((y, i) => (
          <g key={i}>
            <line
              x1={MARGIN.left}
              x2={VB_W - MARGIN.right}
              y1={y}
              y2={y}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
            <text x={MARGIN.left - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--viz-ink-muted)">
              {formatAxisValue(gridLabels[i])}
            </text>
          </g>
        ))}

        <text x={MARGIN.left} y={VB_H - 6} fontSize={10} fill="var(--viz-ink-muted)">
          {points[0].period}
        </text>
        <text x={VB_W - MARGIN.right} y={VB_H - 6} textAnchor="end" fontSize={10} fill="var(--viz-ink-muted)">
          {points[points.length - 1].period}
        </text>

        <path d={linePath} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="series-stroke" />

        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={4} className="series-fill" />

        {hoverX !== null && hoverY !== null && (
          <g>
            <line x1={hoverX} x2={hoverX} y1={MARGIN.top} y2={VB_H - MARGIN.bottom} stroke="var(--viz-axis)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={hoverX} cy={hoverY} r={5} className="series-fill" stroke="var(--viz-surface)" strokeWidth={2} />
          </g>
        )}

        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>

      {hovered && hoverX !== null && (
        <div
          className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${(hoverX / VB_W) * 100}%` }}
        >
          <div className="font-medium tabular-nums">
            {hovered.value}
            {unit ? ` ${unit}` : ""}
          </div>
          <div className="text-muted-foreground">{hovered.period}</div>
        </div>
      )}
    </div>
  );
}

function formatAxisValue(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
