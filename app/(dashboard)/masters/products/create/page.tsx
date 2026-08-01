import { getFormLookups } from "../actions"
import { ProductForm } from "../components/product-form"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function CreateProductPage() {
  const gate = await guardPage("PRODUCT_MASTER", "CREATE")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const lookups = await getFormLookups()

  return (
    <div>
      <ProductForm lookups={lookups} />
    </div>
  )
}
