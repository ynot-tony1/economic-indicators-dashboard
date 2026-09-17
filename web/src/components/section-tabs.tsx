import Link from "next/link";
import { cn } from "cn";

export function SectionTabs({ countrySlug, active }: { countrySlug: string; active: "overview" | "personality" }) {
  const tabs = [
    { key: "overview" as const, label: "Overview", href: `/${countrySlug}` },
    { key: "personality" as const, label: "Personality", href: `/${countrySlug}/personality` },
  ];

  return (
    <nav className="mt-6 flex gap-1 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors",
            tab.key === active
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
