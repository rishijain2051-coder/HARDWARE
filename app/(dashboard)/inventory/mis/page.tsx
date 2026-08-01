import { MisListClient } from "./client"
import { getMisList } from "./actions"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function MisListPage() {
  const gate = await guardPage("OUTWARD_RECORD", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const misList = await getMisList()

  return (
    <div className="flex flex-col gap-6">
      <MisListClient data={misList} />
    </div>
  )
}
