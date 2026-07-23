function TableSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-8 w-32 rounded bg-muted" />
          <div className="mt-2 h-4 w-56 rounded bg-muted" />
        </div>
        <div className="h-9 w-32 rounded bg-muted" />
      </div>
      <div className="flex items-center gap-4">
        <div className="h-9 flex-1 max-w-sm rounded bg-muted" />
      </div>
      <div className="rounded-xl border">
        <div className="border-b px-4 py-3">
          <div className="flex gap-8">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 w-20 rounded bg-muted" />
            ))}
          </div>
        </div>
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

export default function ProductsLoading() {
  return <TableSkeleton />
}
