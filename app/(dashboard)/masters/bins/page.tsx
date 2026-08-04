import { BinsClient } from "./client"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function BinsPage() {
  const gate = await guardPage("BIN_MASTER", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  return (
    <div className="flex flex-col gap-6">
      {/* Rows come from the browser cache; see components/dataset-cache.tsx. */}
      <BinsClient />
    </div>
  )
}
