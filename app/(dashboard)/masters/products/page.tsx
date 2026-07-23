import { ProductsClient } from "./client"
import { getProducts } from "./actions"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([
    getProducts(),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ])

  const session = await auth.api.getSession({ headers: await headers() })
  const canEdit = session?.user ? await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT") : false

  return (
    <div className="flex flex-col gap-6 p-6">
      <ProductsClient data={products} categories={categories} canEdit={canEdit} />
    </div>
  )
}
