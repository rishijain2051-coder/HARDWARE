export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-40 rounded bg-muted" />
        <div className="mt-2 h-4 w-64 rounded bg-muted" />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-8 w-8 rounded-lg bg-muted" />
            </div>
            <div className="mt-2 h-7 w-12 rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6">
            <div className="mb-4 h-6 w-32 rounded bg-muted" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-14 rounded-lg border bg-muted/30" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
