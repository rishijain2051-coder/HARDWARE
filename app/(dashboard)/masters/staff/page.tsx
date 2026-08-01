import { StaffClient } from "./client"
import { getStaff } from "./actions"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function StaffPage() {
  const gate = await guardPage("STAFF_MASTER", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const staff = await getStaff()

  return (
    <div className="flex flex-col gap-6">
      <StaffClient data={staff} />
    </div>
  )
}
