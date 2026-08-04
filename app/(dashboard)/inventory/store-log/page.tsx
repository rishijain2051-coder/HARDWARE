import { StoreLogClient } from "./client"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function StoreLogPage() {
  const gate = await guardPage("STORE_LOG", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  // Rows come from the browser cache; see components/dataset-cache.tsx.
  return (
    <div className="flex flex-col gap-6">
      <StoreLogClient />
    </div>
  )
}
