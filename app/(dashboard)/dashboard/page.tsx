import { guardPage } from "@/lib/dal"
import { AccessDenied } from "@/components/access-denied"
import { DashboardClient } from "./client"

export default async function DashboardPage() {
  const gate = await guardPage("DASHBOARD", "VIEW")
  if (!gate.allowed) return <AccessDenied {...gate.denial!} />

  // The figures are read through the browser cache rather than queried here on
  // every visit. They are still assembled server-side against this user's
  // permissions — see `readDashboard` in lib/datasets/actions.ts — so a role with
  // no product access neither sees stock figures nor causes the query to run.
  return <DashboardClient />
}
