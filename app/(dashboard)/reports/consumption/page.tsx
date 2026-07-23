import { ConsumptionClient } from "./client"
import { getStaffList } from "./actions"

export default async function ConsumptionReportPage() {
  const staffList = await getStaffList()

  return (
    <div className="flex flex-col gap-6">
      <ConsumptionClient staffList={staffList} />
    </div>
  )
}
