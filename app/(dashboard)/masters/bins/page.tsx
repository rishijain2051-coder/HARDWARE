import { BinsClient } from "./client"
import { getBins } from "./actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export default async function BinsPage() {
  const bins = await getBins()
  
  const session = await auth.api.getSession({ headers: await headers() })
  const canEdit = session?.user ? await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT") : false

  return (
    <div className="flex flex-col gap-6 p-6">
      <BinsClient data={bins} canEdit={canEdit} />
    </div>
  )
}
