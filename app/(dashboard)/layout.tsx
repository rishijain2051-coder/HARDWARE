import { redirect } from "next/navigation"

import { getAccess, getCurrentUser } from "@/lib/dal"
import ClientLayout from "./client-layout"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // The layout resolves the user for the chrome (sidebar, avatar); the actual
  // authorisation for each screen happens in the page itself, because layouts
  // are not re-rendered on client-side navigation between sibling routes.
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const access = await getAccess()

  return (
    <ClientLayout
      access={{
        keys: access.keys,
        isSuperAdmin: access.isSuperAdmin,
        isAuthenticated: access.isAuthenticated,
      }}
      user={{
        name: user.name,
        email: user.email,
        roleName: user.role.name,
      }}
    >
      {children}
    </ClientLayout>
  )
}
