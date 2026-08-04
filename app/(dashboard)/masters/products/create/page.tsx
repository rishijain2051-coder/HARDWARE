import { ProductForm } from "../components/product-form"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function CreateProductPage() {
  const gate = await guardPage("PRODUCT_MASTER", "CREATE")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  // The form reads categories, units, bins and attributes from the browser
  // cache, so nothing but the permission check happens here.
  return (
    <div>
      <ProductForm />
    </div>
  )
}
