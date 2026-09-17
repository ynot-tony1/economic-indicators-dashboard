import type { CountryTraitRow } from "@/db/queries";
import { TRAIT_META } from "@/lib/traits";

export function TraitList({
  traits,
  color,
}: {
  traits: CountryTraitRow[];
  color: { light: string; dark: string };
}) {
  return (
    <ul className="space-y-4">
      {traits.map((t) => {
        const meta = TRAIT_META[t.trait];
        const pct = ((t.score - 1) / 4) * 100;
        return (
          <li key={t.trait}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{meta.name}</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{t.score}/5</span>
            </div>
            <div
              className="relative mt-2 h-1 rounded-full bg-foreground/10"
              style={{ "--trait-light": color.light, "--trait-dark": color.dark } as React.CSSProperties}
            >
              <span
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card [background-color:var(--trait-light)] dark:[background-color:var(--trait-dark)]"
                style={{ left: `${pct}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{meta.poleLow}</span>
              <span>{meta.poleHigh}</span>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{t.summary}</p>
          </li>
        );
      })}
    </ul>
  );
}
