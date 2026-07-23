import { StoreLogClient } from "./client"
import { getStoreLogs } from "./actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export default async function StoreLogPage() {
  const logs = await getStoreLogs()
  const session = await auth.api.getSession({ headers: await headers() })
  const canEdit = session?.user ? await hasPermission(session.user.id, "STORE_LOG", "EDIT") : false

  return (
    <div className="flex flex-col gap-6">
      <StoreLogClient data={logs} canEdit={canEdit} />
    </div>
  )
}
