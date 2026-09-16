import { categoryLabel } from "@/lib/categories";

export function CategoryQuickNav({
  categories,
  counts,
}: {
  categories: string[];
  counts: Record<string, number>;
}) {
  return (
    <nav
      aria-label="Jump to category"
      className="sticky top-14 z-10 -mx-6 overflow-x-auto border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/75"
    >
      <ul className="flex min-w-max gap-1 py-2">
        {categories.map((category) => (
          <li key={category}>
            <a
              href={`#${category}`}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {categoryLabel(category)}
              <span className="text-xs tabular-nums text-muted-foreground/70">{counts[category]}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
