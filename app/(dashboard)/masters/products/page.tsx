import { ProductsClient } from "./client"
import { getProducts } from "./actions"
import { prisma } from "@/lib/prisma"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function ProductsPage() {
  const gate = await guardPage("PRODUCT_MASTER", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const [products, categories] = await Promise.all([
    getProducts(),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <ProductsClient data={products} categories={categories} />
    </div>
  )
}
