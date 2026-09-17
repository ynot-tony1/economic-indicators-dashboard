"use client";

import { useEffect, useState } from "react";
import { IndicatorCard } from "@/components/indicator-card";
import { categoryLabel } from "@/lib/categories";
import type { LatestIndicatorRow } from "@/db/queries";
import { cn } from "cn";

const DEFAULT_CATEGORY = "gdp";
const ALL = "all";

export function IndicatorCategoryBrowser({
  countrySlug,
  rows,
  categories,
  counts,
}: {
  countrySlug: string;
  rows: LatestIndicatorRow[];
  categories: string[];
  counts: Record<string, number>;
}) {
  const fallback = categories.includes(DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : (categories[0] ?? ALL);
  const [active, setActive] = useState(fallback);

  // Deep links (e.g. the indicator detail page's "Back to X" link) pass a
  // `?category=` param. Read it client-side only, after mount, so the
  // default view still renders synchronously in the server/static HTML
  // instead of bailing out to a client-only Suspense fallback.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("category");
    if (requested && (requested === ALL || categories.includes(requested))) {
      setActive(requested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectCategory(category: string) {
    setActive(category);
    const params = new URLSearchParams(window.location.search);
    if (category === fallback) {
      params.delete("category");
    } else {
      params.set("category", category);
    }
    const query = params.toString();
    const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }

  const shownCategories = active === ALL ? categories : [active];

  return (
    <>
      <nav aria-label="Filter by category" className="sticky top-14 z-10 -mx-6 overflow-x-auto border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <ul className="flex min-w-max gap-1 py-2">
          {categories.map((category) => (
            <li key={category}>
              <button
                type="button"
                onClick={() => selectCategory(category)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
                  active === category
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {categoryLabel(category)}
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    active === category ? "text-background/70" : "text-muted-foreground/70",
                  )}
                >
                  {counts[category]}
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => selectCategory(ALL)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
                active === ALL
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              All
              <span className={cn("font-mono text-xs tabular-nums", active === ALL ? "text-background/70" : "text-muted-foreground/70")}>
                {rows.length}
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <div className="space-y-12 py-8">
        {shownCategories.map((category) => (
          <section key={category} id={category} className="scroll-mt-28">
            {active === ALL && (
              <div className="mb-4 flex items-baseline gap-2 border-b pb-2">
                <h2 className="text-base font-semibold tracking-tight">{categoryLabel(category)}</h2>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{counts[category]}</span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows
                .filter((r) => r.category === category)
                .map((row) => (
                  <IndicatorCard key={row.id} countrySlug={countrySlug} row={row} />
                ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
