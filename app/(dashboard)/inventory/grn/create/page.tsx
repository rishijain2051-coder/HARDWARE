import { prisma } from "@/lib/prisma"
import { GrnCreateClient } from "./client"

export default async function GrnCreatePage() {
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

  // For now use a placeholder userId; in production this comes from the session
  const systemUser = await prisma.user.findFirst({ where: { email: "system@hardware.local" } })
  const userId = systemUser?.id || ""

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
