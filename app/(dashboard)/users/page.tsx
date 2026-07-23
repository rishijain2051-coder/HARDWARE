import { UsersClient } from "./client"
import { getUsers, getRoles, getPermissions } from "./actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export default async function UsersPage() {
  const [users, roles, permissions, session] = await Promise.all([
    getUsers(),
    getRoles(),
    getPermissions(),
    auth.api.getSession({ headers: await headers() }),
  ])

  const canEdit = session?.user ? await hasPermission(session.user.id, "USER_MANAGEMENT", "EDIT") : false

  return (
    <div className="flex flex-col gap-6">
      <UsersClient data={users} roles={roles} permissions={permissions} canEdit={canEdit} />
    </div>
  )
}
