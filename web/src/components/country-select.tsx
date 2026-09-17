"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "cn";

type CountryOption = { slug: string; name: string; flagEmoji: string };

export function CountrySelect({
  countries,
  activeSlug,
  size = "default",
}: {
  countries: CountryOption[];
  activeSlug?: string;
  size?: "default" | "large";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const active = countries.find((c) => c.slug === activeSlug);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.name.toLowerCase().includes(q));
  }, [countries, query]);

  function select(slug: string) {
    setOpen(false);
    setQuery("");
    router.push(`/${slug}`);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={open ? query : ""}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={active ? `${active.flagEmoji} ${active.name}` : "Search countries..."}
        className={cn(
          "w-full rounded-lg border bg-background text-left outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
          size === "large" ? "px-4 py-3 text-base" : "px-3 py-1.5 text-sm",
        )}
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-lg border bg-popover py-1 shadow-md">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">No countries match &ldquo;{query}&rdquo;</li>
          )}
          {filtered.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(c.slug)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted",
                  c.slug === activeSlug && "font-medium text-foreground",
                )}
              >
                <span aria-hidden>{c.flagEmoji}</span>
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
