"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Collapsible container for the fields a form doesn't need every time.
 *
 * Most master records are created with just a name — chasing GST numbers and
 * employee codes on every entry slows the common case down for no benefit. The
 * required fields stay visible; everything else hides behind one toggle.
 *
 * The children stay **mounted** and are hidden with CSS rather than being
 * unmounted, so react-hook-form registration, half-typed input, and validation
 * state all survive collapsing the section.
 */
export function OptionalFields({
  count,
  defaultOpen = false,
  label = "optional details",
  className,
  children,
}: {
  /** Shown in the collapsed label, e.g. "Add 5 optional details". */
  count?: number
  /** Open on mount — pass true when editing a record that already has values. */
  defaultOpen?: boolean
  label?: string
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={cn("space-y-4", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-solid hover:bg-muted/50 hover:text-foreground"
      >
        <ChevronRight
          className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
        />
        <span>
          {open
            ? `Hide ${label}`
            : `Add ${count ? `${count} ` : ""}${label}`}
        </span>
        {!open && (
          <span className="ml-auto text-xs text-muted-foreground/70">
            optional
          </span>
        )}
      </button>

      <div className={cn("space-y-4", !open && "hidden")}>{children}</div>
    </div>
  )
}
