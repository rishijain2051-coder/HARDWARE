import { SuppliersClient } from "./client"
import { getSuppliers } from "./actions"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function SuppliersPage() {
  const gate = await guardPage("SUPPLIER_MASTER", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const suppliers = await getSuppliers()

  return (
    <div className="flex flex-col gap-6">
      <SuppliersClient data={suppliers} />
    </div>
  )
}
