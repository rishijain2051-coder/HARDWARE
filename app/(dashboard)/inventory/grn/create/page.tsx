import { GrnCreateClient } from "./client"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function GrnCreatePage() {
  const gate = await guardPage("INWARD_RECORD", "CREATE")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  // No lists are read here on purpose. Suppliers, bins and the product master
  // used to be queried and serialised into this page's payload on every visit;
  // the form now reads them from the browser cache instead, which leaves this
  // page as nothing but a permission check.
  return (
    <div>
      <GrnCreateClient />
    </div>
  )
}
