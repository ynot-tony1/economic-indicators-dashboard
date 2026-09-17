"use client";

import { useState } from "react";
import type { CountryTraitRow } from "@/db/queries";
import { TRAIT_META } from "@/lib/traits";

const SIZE = 320;
const CENTER = SIZE / 2;
const MAX_R = 108;
const MIN_R = MAX_R * 0.18;
const LABEL_R = MAX_R + 34;

function pointFor(index: number, total: number, radius: number) {
  const angle = -Math.PI / 2 + (index / total) * 2 * Math.PI;
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

function radiusForScore(score: number) {
  return MIN_R + ((score - 1) / 4) * (MAX_R - MIN_R);
}

export function RadarChart({
  traits,
  color,
}: {
  traits: CountryTraitRow[];
  color: { light: string; dark: string };
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = traits.length;

  const dataPoints = traits.map((t, i) => pointFor(i, total, radiusForScore(t.score)));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

  const rings = [1, 2, 3, 4, 5];

  const active = activeIndex !== null ? traits[activeIndex] : null;
  const activeMeta = active ? TRAIT_META[active.trait] : null;
  const activePoint = activeIndex !== null ? dataPoints[activeIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-md mx-auto"
        style={{ "--series-light": color.light, "--series-dark": color.dark } as React.CSSProperties}
      >
        <style>{`
          .series-stroke { stroke: var(--series-light); }
          .series-fill { fill: var(--series-light); }
          .dark .series-stroke { stroke: var(--series-dark); }
          .dark .series-fill { fill: var(--series-dark); }
        `}</style>

        {rings.map((score) => {
          const ringPoints = traits.map((_, i) => pointFor(i, total, radiusForScore(score)));
          const ringPath = ringPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";
          return <path key={score} d={ringPath} fill="none" stroke="var(--viz-grid)" strokeWidth={1} />;
        })}

        {traits.map((_, i) => {
          const outer = pointFor(i, total, MAX_R);
          return (
            <line
              key={i}
              x1={CENTER}
              y1={CENTER}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
          );
        })}

        <path d={dataPath} className="series-fill" fillOpacity={0.16} stroke="none" />
        <path d={dataPath} className="series-stroke" fill="none" strokeWidth={2} strokeLinejoin="round" />

        {traits.map((t, i) => {
          const p = dataPoints[i];
          const isActive = i === activeIndex;
          return (
            <circle
              key={t.trait}
              cx={p.x}
              cy={p.y}
              r={isActive ? 6 : 4}
              className="series-fill cursor-pointer"
              stroke="var(--viz-surface)"
              strokeWidth={2}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              onClick={() => setActiveIndex(isActive ? null : i)}
            />
          );
        })}

        {traits.map((t, i) => {
          const labelPoint = pointFor(i, total, LABEL_R);
          const meta = TRAIT_META[t.trait];
          const anchor = Math.abs(labelPoint.x - CENTER) < 8 ? "middle" : labelPoint.x > CENTER ? "start" : "end";
          return (
            <text
              key={t.trait}
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize={11}
              fontWeight={i === activeIndex ? 600 : 500}
              fill={i === activeIndex ? "var(--viz-ink-secondary,currentColor)" : "var(--viz-ink-muted)"}
              className="cursor-pointer select-none"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              onClick={() => setActiveIndex(i === activeIndex ? null : i)}
            >
              {meta.name}
            </text>
          );
        })}
      </svg>

      {active && activeMeta && activePoint && (
        <div
          className="pointer-events-none absolute w-48 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          style={{
            left: `${(activePoint.x / SIZE) * 100}%`,
            top: `${(activePoint.y / SIZE) * 100}%`,
            marginTop: activePoint.y > CENTER ? "12px" : "-88px",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{activeMeta.name}</span>
            <span className="font-mono tabular-nums text-muted-foreground">{active.score}/5</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {activeMeta.poleLow} <span aria-hidden>&harr;</span> {activeMeta.poleHigh}
          </div>
          <div className="mt-1.5 text-foreground">{active.summary}</div>
        </div>
      )}
    </div>
  );
}
