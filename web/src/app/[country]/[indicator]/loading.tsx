import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Skeleton className="h-4 w-32" />
      <div className="mt-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-8 w-72" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="mt-10 h-60 rounded-lg" />
    </div>
  );
}
