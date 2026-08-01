import { notFound } from "next/navigation"
import { getProductById, getFormLookups } from "../../actions"
import { ProductForm } from "../../components/product-form"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const gate = await guardPage("PRODUCT_MASTER", "EDIT")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const { id } = await params
  const [product, lookups] = await Promise.all([
    getProductById(id),
    getFormLookups(),
  ])

  if (!product) notFound()

  return (
    <div>
      <ProductForm initialData={product} lookups={lookups} />
    </div>
  )
}
