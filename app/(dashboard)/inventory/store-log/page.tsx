import { StoreLogClient } from "./client"
import { getStoreLogs } from "./actions"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function StoreLogPage() {
  const gate = await guardPage("STORE_LOG", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const logs = await getStoreLogs()

  return (
    <div className="flex flex-col gap-6">
      <StoreLogClient data={logs} />
    </div>
  )
}
