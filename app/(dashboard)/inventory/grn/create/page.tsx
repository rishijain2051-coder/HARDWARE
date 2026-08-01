import { prisma } from "@/lib/prisma"
import { GrnCreateClient } from "./client"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function GrnCreatePage() {
  const gate = await guardPage("INWARD_RECORD", "CREATE")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const [suppliers, products, bins, categories, units] = await Promise.all([
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.hardwareProduct.findMany({
      where: { isActive: true },
      orderBy: { sku: "asc" },
      select: { id: true, sku: true, description: true, currentStock: true, lastPurchaseRate: true, imageUrl: true, aliases: { select: { alias: true } } },
    }),
    prisma.bin.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.unit.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ])

  // The GRN is attributed to the signed-in user. `saveGrn` re-derives this from
  // the session server-side and ignores whatever the client submits.
  const userId = gate.user!.id

  return (
    <div>
      <GrnCreateClient
        suppliers={suppliers}
        products={products}
        bins={bins}
        categories={categories}
        units={units}
        userId={userId}
      />
    </div>
  )
}
