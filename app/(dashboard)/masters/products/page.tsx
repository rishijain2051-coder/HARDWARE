import { ProductsClient } from "./client"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function ProductsPage() {
  const gate = await guardPage("PRODUCT_MASTER", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  // Rows come from the browser cache; see components/dataset-cache.tsx. The
  // category list this page also used to fetch was never read by the client.
  return (
    <div className="flex flex-col gap-6">
      <ProductsClient />
    </div>
  )
}
