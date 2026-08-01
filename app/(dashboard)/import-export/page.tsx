import { ImportExportClient } from "./client"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function ImportExportPage() {
  const gate = await guardPage("DATA_TRANSFER", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  return (
    <div>
      <ImportExportClient />
    </div>
  )
}
