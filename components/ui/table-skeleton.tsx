/**
 * Placeholders for screens whose data has not arrived yet.
 *
 * Only ever visible on a cold cache or a full page reload — a client-side
 * navigation reads localStorage during render and goes straight to the real
 * content. They exist so that frame shows something shaped like the screen
 * instead of an empty "No results." that reads as "there is nothing here".
 */

/** Body of a table, without the toolbar; DataTable keeps rendering the real one. */
export function TableSkeleton({
  rows = 8,
  columns = 5,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <div
      className="rounded-xl border border-slate-200/60 glass overflow-hidden shadow-sm"
      aria-busy="true"
    >
      <span className="sr-only">Loading…</span>
      <div className="flex gap-4 border-b px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-4 flex-1 animate-pulse rounded bg-muted" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b px-4 py-3 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className="h-4 flex-1 animate-pulse rounded bg-muted/60"
              // A little variation stops it reading as a loading *table* of
              // perfectly identical bars.
              style={{ animationDelay: `${((r + c) % 5) * 90}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Placeholder for a row of stat cards. */
export function CardsSkeleton({ cards = 5 }: { cards?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5"
      aria-busy="true"
    >
      <span className="sr-only">Loading…</span>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
          </div>
          <div className="mt-3 h-7 w-12 animate-pulse rounded bg-muted/60" />
        </div>
      ))}
    </div>
  )
}

/** Placeholder for a panel of list items. */
export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-lg border p-3"
        >
          <div className="space-y-2">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-muted/60" />
        </div>
      ))}
    </div>
  )
}

/** Inline error for a screen whose data could not be fetched. */
export function DataLoadError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
    >
      {message}
    </div>
  )
}
