import { notFound } from "next/navigation"
import { getProductById, getFormLookups } from "../../actions"
import { ProductForm } from "../../components/product-form"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
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
