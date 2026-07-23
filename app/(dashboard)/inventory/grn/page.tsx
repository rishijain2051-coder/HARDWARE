import { GrnListClient } from "./client"
import { getGrnList } from "./actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export default async function GrnListPage() {
  const grns = await getGrnList()

  const session = await auth.api.getSession({ headers: await headers() })
  const canEdit = session?.user ? await hasPermission(session.user.id, "INWARD_RECORD", "EDIT") : false

  return (
    <div className="flex flex-col gap-6 p-6">
      <GrnListClient data={grns} canEdit={canEdit} />
    </div>
  )
}
