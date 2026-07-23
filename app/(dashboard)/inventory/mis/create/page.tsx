import { prisma } from "@/lib/prisma"
import { MisCreateClient } from "./client"

export default async function MisCreatePage() {
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

  const systemUser = await prisma.user.findFirst({ where: { email: "system@hardware.local" } })
  const userId = systemUser?.id || ""

  return (
    <div className="p-6">
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
