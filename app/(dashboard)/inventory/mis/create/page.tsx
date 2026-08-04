import { MisCreateClient } from "./client"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function MisCreatePage() {
  const gate = await guardPage("OUTWARD_RECORD", "CREATE")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  // Staff, bins and the product master are read from the browser cache by the
  // form rather than queried and serialised here on every visit, so this page
  // is just the permission check. See components/lookup-cache.tsx.
  return (
    <div>
      <MisCreateClient />
    </div>
  )
}
