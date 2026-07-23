import { AttributesClient } from "./client"
import { getAttributes } from "./actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export default async function AttributesPage() {
  const attributes = await getAttributes()
  
  const session = await auth.api.getSession({ headers: await headers() })
  const canEdit = session?.user ? await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT") : false

  return (
    <div className="flex flex-col gap-6">
      <AttributesClient data={attributes} canEdit={canEdit} />
    </div>
  )
}
