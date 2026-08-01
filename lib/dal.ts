import "server-only"

import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  createPermissionSet,
  isModuleKey,
  isPermissionAction,
  landingRouteFor,
  moduleLabel,
  NO_PERMISSIONS,
  permissionKey,
  type ModuleKey,
  type PermissionAction,
  type PermissionSet,
} from "@/lib/permissions"

/**
 * Data Access Layer.
 *
 * Every authorisation decision in the app resolves through `getAccess()`.
 * It is wrapped in React's `cache()`, so the session lookup and the
 * role/permission join run **once per request** no matter how many pages,
 * components, or server actions ask for them — the previous implementation
 * re-queried the full user + role + permissions graph on every single check.
 *
 * Note on layouts: Next.js layouts do not re-render on client-side navigation
 * (partial rendering), so a check placed in a layout would be skipped when the
 * user navigates between sibling routes. Guards therefore live in *pages*,
 * *server actions*, and *route handlers* — never in a layout.
 */

export interface CurrentUser {
  id: string
  email: string
  name: string
  isActive: boolean
  role: {
    id: string
    name: string
    isSuperAdmin: boolean
    isSystem: boolean
  }
  /** Granted permissions as "MODULE:ACTION" strings. */
  permissionKeys: string[]
}

/**
 * Resolves the signed-in user together with their role and permissions in a
 * single query. Returns null when there is no session, or when the account has
 * been deactivated — a deactivated user holding a still-valid session cookie
 * previously kept full access until the cookie expired.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return null

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        role: {
          select: {
            id: true,
            name: true,
            isSuperAdmin: true,
            isSystem: true,
            permissions: {
              select: {
                permission: { select: { module: true, action: true } },
              },
            },
          },
        },
      },
    })

    if (!user || !user.isActive || !user.role) return null

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      role: {
        id: user.role.id,
        name: user.role.name,
        isSuperAdmin: user.role.isSuperAdmin,
        isSystem: user.role.isSystem,
      },
      permissionKeys: user.role.permissions
        .map((rp) => rp.permission)
        // Drop rows left over from an older catalogue so they can never
        // accidentally satisfy a modern check.
        .filter((p) => isModuleKey(p.module) && isPermissionAction(p.action))
        .map((p) => permissionKey(p.module, p.action)),
    }
  } catch {
    return null
  }
})

/** The permission set for the current request. Never throws. */
export const getAccess = cache(async (): Promise<PermissionSet> => {
  const user = await getCurrentUser()
  if (!user) return NO_PERMISSIONS

  return createPermissionSet({
    keys: user.permissionKeys,
    isSuperAdmin: user.role.isSuperAdmin,
    isAuthenticated: true,
  })
})

// ============================================================
// Page guards
// ============================================================

export interface PageGuardResult {
  /** True when the page may render. */
  allowed: boolean
  access: PermissionSet
  user: CurrentUser | null
  /** Populated when `allowed` is false — feed straight into <AccessDenied />. */
  denial: {
    module: ModuleKey
    moduleLabel: string
    action: PermissionAction
    fallbackHref: string
  } | null
}

/**
 * Guard for a server-rendered page.
 *
 * Redirects to /login when unauthenticated (there is nothing useful to show a
 * logged-out visitor), and otherwise reports the denial so the page can render
 * an in-place "no access" screen. Rendering in place — rather than redirecting —
 * keeps the URL stable and the sidebar intact, which is far less confusing than
 * being bounced somewhere unexpected.
 *
 *   const gate = await guardPage("INWARD_RECORD")
 *   if (!gate.allowed) return <AccessDenied {...gate.denial!} />
 */
export async function guardPage(
  module: ModuleKey,
  action: PermissionAction = "VIEW"
): Promise<PageGuardResult> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const access = await getAccess()
  if (access.can(module, action)) {
    return { allowed: true, access, user, denial: null }
  }

  return {
    allowed: false,
    access,
    user,
    denial: {
      module,
      moduleLabel: moduleLabel(module),
      action,
      fallbackHref: landingRouteFor(access),
    },
  }
}

/** Requires a session but no particular permission. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

// ============================================================
// Server action guards
// ============================================================

export interface ActionFailure {
  success: false
  error: string
}

export interface AuthorizedActor {
  success: true
  user: CurrentUser
  access: PermissionSet
}

export type AuthorizeResult = AuthorizedActor | ActionFailure

/**
 * Guard for a server action or route handler. Returns a discriminated union so
 * callers keep the `{ success, error }` contract the UI already expects:
 *
 *   const auth = await authorize("PRODUCT_MASTER", "CREATE")
 *   if (!auth.success) return auth
 *   // auth.user is available and typed from here on
 */
export async function authorize(
  module: ModuleKey,
  action: PermissionAction
): Promise<AuthorizeResult> {
  const user = await getCurrentUser()
  if (!user) {
    return { success: false, error: "Your session has expired. Please sign in again." }
  }

  const access = await getAccess()
  if (!access.can(module, action)) {
    return {
      success: false,
      error: `You do not have permission to ${action.toLowerCase()} ${moduleLabel(module)}.`,
    }
  }

  return { success: true, user, access }
}

/**
 * Guard for actions that require *any* of several permissions — e.g. a combined
 * save handler that creates when there is no id and updates when there is one,
 * or a screen that reads two modules at once.
 */
export async function authorizeAny(
  checks: { module: ModuleKey; action: PermissionAction }[]
): Promise<AuthorizeResult> {
  const user = await getCurrentUser()
  if (!user) {
    return { success: false, error: "Your session has expired. Please sign in again." }
  }

  const access = await getAccess()
  if (checks.some((c) => access.can(c.module, c.action))) {
    return { success: true, user, access }
  }

  const labels = [...new Set(checks.map((c) => moduleLabel(c.module)))].join(" or ")
  return { success: false, error: `You do not have permission to access ${labels}.` }
}

/** Guard for the handful of destructive operations reserved for super admins. */
export async function authorizeSuperAdmin(): Promise<AuthorizeResult> {
  const user = await getCurrentUser()
  if (!user) {
    return { success: false, error: "Your session has expired. Please sign in again." }
  }

  const access = await getAccess()
  if (!access.isSuperAdmin) {
    return {
      success: false,
      error: "Only administrators can permanently delete records.",
    }
  }

  return { success: true, user, access }
}

// ============================================================
// Route handler guard
// ============================================================

/**
 * Permission check for API route handlers. Returns a ready-to-send `Response`
 * on failure, or null when the caller may proceed.
 */
export async function guardRoute(
  module: ModuleKey,
  action: PermissionAction
): Promise<Response | null> {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json(
      { success: false, error: "Authentication required" },
      { status: 401 }
    )
  }

  const access = await getAccess()
  if (!access.can(module, action)) {
    return Response.json(
      {
        success: false,
        error: `You do not have permission to ${action.toLowerCase()} ${moduleLabel(module)}.`,
      },
      { status: 403 }
    )
  }

  return null
}
