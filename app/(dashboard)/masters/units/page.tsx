import { UnitsClient } from "./client"
import { getUnits } from "./actions"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function UnitsPage() {
  const gate = await guardPage("UNIT_MASTER", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const units = await getUnits()

  return (
    <div className="flex flex-col gap-6">
      <UnitsClient data={units} />
    </div>
  )
}
