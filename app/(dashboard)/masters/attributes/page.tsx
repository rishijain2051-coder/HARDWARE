import { AttributesClient } from "./client"
import { getAttributes } from "./actions"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function AttributesPage() {
  const gate = await guardPage("ATTRIBUTE_MASTER", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const attributes = await getAttributes()

  return (
    <div className="flex flex-col gap-6">
      <AttributesClient data={attributes} />
    </div>
  )
}
