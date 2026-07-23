import { SuppliersClient } from "./client"
import { getSuppliers } from "./actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export default async function SuppliersPage() {
  const suppliers = await getSuppliers()
  
  const session = await auth.api.getSession({ headers: await headers() })
  const canEdit = session?.user ? await hasPermission(session.user.id, "SUPPLIER_MASTER", "EDIT") : false

  return (
    <div className="flex flex-col gap-6">
      <SuppliersClient data={suppliers} canEdit={canEdit} />
    </div>
  )
}
