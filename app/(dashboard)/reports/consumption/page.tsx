import { ConsumptionClient } from "./client"
import { getStaffList } from "./actions"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function ConsumptionReportPage() {
  const gate = await guardPage("REPORTS", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const staffList = await getStaffList()

  return (
    <div className="flex flex-col gap-6">
      <ConsumptionClient staffList={staffList} />
    </div>
  )
}
