import { UsersClient } from "./client"
import { getUsers, getRoles, getPermissions } from "./actions"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function UsersPage() {
  const gate = await guardPage("USER_MANAGEMENT", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const [users, roles, permissions] = await Promise.all([
    getUsers(),
    getRoles(),
    getPermissions(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <UsersClient
        data={users}
        roles={roles}
        permissions={permissions}
        currentUserId={gate.user!.id}
        currentRoleId={gate.user!.role.id}
      />
    </div>
  )
}
