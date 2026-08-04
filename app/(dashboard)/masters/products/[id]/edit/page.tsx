import { notFound } from "next/navigation"
import { getProductById } from "../../actions"
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
  // Only the product being edited is read here; the reference lists come from
  // the browser cache inside the form.
  const product = await getProductById(id)

  if (!product) notFound()

  return (
    <div>
      <ProductForm initialData={product} />
    </div>
  )
}
