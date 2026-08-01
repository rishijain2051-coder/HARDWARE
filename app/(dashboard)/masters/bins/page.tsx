import { BinsClient } from "./client"
import { getBins } from "./actions"
import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"

export default async function BinsPage() {
  const gate = await guardPage("BIN_MASTER", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  const bins = await getBins()

  return (
    <div className="flex flex-col gap-6">
      <BinsClient data={bins} />
    </div>
  )
}
