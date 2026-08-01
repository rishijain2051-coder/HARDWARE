import { ShieldOff } from "lucide-react"

import { requireUser } from "@/lib/dal"

/**
 * Landing page for an authenticated user whose role grants nothing at all.
 * Without this they would bounce between guarded pages with no explanation.
 */
export default async function NoAccessPage() {
  const user = await requireUser()

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 inline-flex rounded-full bg-amber-500/10 p-4">
          <ShieldOff className="h-8 w-8 text-amber-500" />
        </div>

        <h2 className="text-xl font-semibold tracking-tight">
          No sections assigned yet
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;re signed in as{" "}
          <span className="font-medium text-foreground">{user.email}</span>, but
          the{" "}
          <span className="font-medium text-foreground">{user.role.name}</span>{" "}
          role doesn&apos;t have permission to view any part of the system yet.
        </p>

        <p className="mt-4 text-xs text-muted-foreground">
          Ask an administrator to grant your role access from Users &amp; Roles.
        </p>
      </div>
    </div>
  )
}
