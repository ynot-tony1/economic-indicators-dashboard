import Link from "next/link";
import { cn } from "cn";

export function CountryNav({
  countries,
  activeSlug,
}: {
  countries: { slug: string; name: string; flagEmoji: string }[];
  activeSlug: string;
}) {
  return (
    <nav className="flex gap-1 rounded-lg bg-muted p-1">
      {countries.map((c) => (
        <Link
          key={c.slug}
          href={`/${c.slug}`}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            c.slug === activeSlug
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span aria-hidden>{c.flagEmoji}</span>
          {c.name}
        </Link>
      ))}
    </nav>
  );
}
