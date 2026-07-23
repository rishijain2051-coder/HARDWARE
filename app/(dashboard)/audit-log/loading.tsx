export default function AuditLogLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div>
        <div className="h-8 w-32 rounded bg-muted" />
        <div className="mt-2 h-4 w-48 rounded bg-muted" />
      </div>
      <div className="h-9 max-w-sm rounded bg-muted" />
      <div className="rounded-xl border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b px-4 py-3 last:border-0">
            <div className="flex gap-8">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-4 w-20 rounded bg-muted" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
