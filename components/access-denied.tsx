import Link from "next/link"
import { ArrowLeft, ShieldOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ACTION_LABELS, type PermissionAction } from "@/lib/permissions"

/**
 * Shown in place of a page the current role may not open.
 *
 * Rendered inline rather than redirected to, so the URL stays put and the user
 * can see exactly which permission they are missing — useful information to
 * pass on to whoever administers their role.
 */
export function AccessDenied({
  moduleLabel,
  action = "VIEW",
  fallbackHref = "/dashboard",
}: {
  module?: string
  moduleLabel: string
  action?: PermissionAction
  fallbackHref?: string
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 inline-flex rounded-full bg-destructive/10 p-4">
          <ShieldOff className="h-8 w-8 text-destructive" />
        </div>

        <h2 className="text-xl font-semibold tracking-tight">
          You don&apos;t have access to this section
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          Your role is missing the{" "}
          <span className="font-medium text-foreground">
            {ACTION_LABELS[action]}
          </span>{" "}
          permission for{" "}
          <span className="font-medium text-foreground">{moduleLabel}</span>.
        </p>

        <p className="mt-4 text-xs text-muted-foreground">
          Ask an administrator to grant it from Users &amp; Roles.
        </p>

        <Button asChild variant="outline" className="mt-6">
          <Link href={fallbackHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go to a section you can access
          </Link>
        </Button>
      </div>
    </div>
  )
}
