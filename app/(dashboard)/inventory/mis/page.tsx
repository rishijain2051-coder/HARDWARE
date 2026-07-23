import { MisListClient } from "./client"
import { getMisList } from "./actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export default async function MisListPage() {
  const [misList, session] = await Promise.all([
    getMisList(),
    auth.api.getSession({ headers: await headers() }),
  ])
  const canEdit = session?.user ? await hasPermission(session.user.id, "OUTWARD_RECORD", "EDIT") : false

  return (
    <div className="flex flex-col gap-6">
      <MisListClient data={misList} canEdit={canEdit} />
    </div>
  )
}
