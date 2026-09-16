export function DbNotConfigured() {
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">Database not configured</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Set the <code className="rounded bg-muted px-1.5 py-0.5">DATABASE_URL</code> environment variable to your
        CockroachDB connection string to see live data here.
      </p>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="mt-16 text-center">
      <h2 className="text-lg font-medium">No data yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The nightly scraper hasn&apos;t run for this country yet. Check back after the next scheduled run, or trigger
        it manually from the GitHub Actions tab.
      </p>
    </div>
  );
}
