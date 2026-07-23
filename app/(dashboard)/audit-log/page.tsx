import { AuditLogClient } from "./client"
import { getAuditLogs } from "./actions"

export default async function AuditLogPage() {
  const logs = await getAuditLogs()

  return (
    <div className="flex flex-col gap-6 p-6">
      <AuditLogClient data={logs} />
    </div>
  )
}
