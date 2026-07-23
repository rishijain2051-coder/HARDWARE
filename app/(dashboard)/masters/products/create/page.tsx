import { getFormLookups } from "../actions"
import { ProductForm } from "../components/product-form"

export default async function CreateProductPage() {
  const lookups = await getFormLookups()

  return (
    <div className="p-6">
      <ProductForm lookups={lookups} />
    </div>
  )
}
