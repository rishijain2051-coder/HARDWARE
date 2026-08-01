import { prisma } from "@/lib/prisma"
import { MisCreateClient } from "./client"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function MisCreatePage() {
  const gate = await guardPage("OUTWARD_RECORD", "CREATE")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const [staff, products, bins, categories, units] = await Promise.all([
    prisma.staff.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.hardwareProduct.findMany({
      where: { isActive: true },
      orderBy: { sku: "asc" },
      select: {
        id: true,
        sku: true,
        description: true,
        currentStock: true,
        lastPurchaseRate: true,
        imageUrl: true,
        aliases: { select: { alias: true } },
        unit: { select: { abbreviation: true } },
      },
    }),
    prisma.bin.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.unit.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ])

  // The MIS is attributed to the signed-in user. `saveMis` re-derives this from
  // the session server-side and ignores whatever the client submits.
  const userId = gate.user!.id

  return (
    <div>
      <MisCreateClient
        staff={staff}
        products={products}
        bins={bins}
        categories={categories}
        units={units}
        userId={userId}
      />
    </div>
  )
}
