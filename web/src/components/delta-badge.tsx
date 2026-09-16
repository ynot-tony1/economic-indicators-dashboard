import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatDelta } from "@/lib/format";

export function DeltaBadge({ last, previous }: { last: string | null; previous: string | null }) {
  const { direction, label } = formatDelta(last, previous);
  if (direction === "none") return null;

  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;
  const colorClass =
    direction === "up"
      ? "text-[var(--viz-good)]"
      : direction === "down"
        ? "text-[var(--viz-critical)]"
        : "text-muted-foreground";

  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-xs font-medium tabular-nums ${colorClass}`}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}
