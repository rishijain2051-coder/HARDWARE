import { MisListClient } from "./client"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function MisListPage() {
  const gate = await guardPage("OUTWARD_RECORD", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  // Rows come from the browser cache; see components/dataset-cache.tsx.
  return (
    <div className="flex flex-col gap-6">
      <MisListClient />
    </div>
  )
}
