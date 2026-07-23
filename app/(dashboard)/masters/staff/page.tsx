import { StaffClient } from "./client"
import { getStaff } from "./actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export default async function StaffPage() {
  const staff = await getStaff()
  
  const session = await auth.api.getSession({ headers: await headers() })
  const canEdit = session?.user ? await hasPermission(session.user.id, "STAFF_MASTER", "EDIT") : false

  return (
    <div className="flex flex-col gap-6 p-6">
      <StaffClient data={staff} canEdit={canEdit} />
    </div>
  )
}
