import { GrnListClient } from "./client"
import { getGrnList } from "./actions"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function GrnListPage() {
  const gate = await guardPage("INWARD_RECORD", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const grns = await getGrnList()

  return (
    <div className="flex flex-col gap-6">
      <GrnListClient data={grns} />
    </div>
  )
}
