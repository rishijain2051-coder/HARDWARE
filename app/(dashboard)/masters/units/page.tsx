import { UnitsClient } from "./client"
import { getUnits } from "./actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export default async function UnitsPage() {
  const units = await getUnits()
  
  const session = await auth.api.getSession({ headers: await headers() })
  const canEdit = session?.user ? await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT") : false

  return (
    <div className="flex flex-col gap-6 p-6">
      <UnitsClient data={units} canEdit={canEdit} />
    </div>
  )
}
