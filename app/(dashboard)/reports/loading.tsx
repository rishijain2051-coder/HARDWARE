export default function ReportsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-28 rounded bg-muted" />
        <div className="mt-2 h-4 w-56 rounded bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="mb-4 h-12 w-12 rounded-lg bg-muted" />
            <div className="h-5 w-32 rounded bg-muted" />
            <div className="mt-2 h-4 w-48 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
