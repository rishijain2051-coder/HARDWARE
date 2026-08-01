"use client"

import { createContext, useContext, useMemo } from "react"

import {
  createPermissionSet,
  NO_PERMISSIONS,
  type ModuleKey,
  type PermissionAction,
  type PermissionSet,
} from "@/lib/permissions"

/**
 * Makes the current user's permissions available to client components.
 *
 * The server serialises the granted keys once in the dashboard layout; this
 * rebuilds the very same `PermissionSet` on the client using the shared pure
 * helper, so a button and the server action behind it evaluate identical logic.
 *
 * This is a *rendering* convenience only. Every gate here is mirrored by a
 * server-side check — hiding a button is UX, not security.
 */

export interface SerializedAccess {
  keys: string[]
  isSuperAdmin: boolean
  isAuthenticated: boolean
}

const PermissionContext = createContext<PermissionSet>(NO_PERMISSIONS)

export function PermissionProvider({
  access,
  children,
}: {
  access: SerializedAccess
  children: React.ReactNode
}) {
  const value = useMemo(
    () =>
      createPermissionSet({
        keys: access.keys,
        isSuperAdmin: access.isSuperAdmin,
        isAuthenticated: access.isAuthenticated,
      }),
    [access.keys, access.isSuperAdmin, access.isAuthenticated]
  )

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  )
}

export function usePermissions(): PermissionSet {
  return useContext(PermissionContext)
}

/** Convenience hook for a single check. */
export function useCan(module: ModuleKey, action: PermissionAction): boolean {
  return usePermissions().can(module, action)
}

/**
 * Renders `children` only when the permission is held.
 *
 *   <Can module="PRODUCT_MASTER" action="CREATE">
 *     <Button>New Product</Button>
 *   </Can>
 */
export function Can({
  module,
  action,
  fallback = null,
  children,
}: {
  module: ModuleKey
  action: PermissionAction
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  return useCan(module, action) ? <>{children}</> : <>{fallback}</>
}
