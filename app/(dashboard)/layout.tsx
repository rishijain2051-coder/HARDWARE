import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getUserPermissions } from "@/lib/permissions"
import ClientLayout from "./client-layout"
import { prisma } from "@/lib/prisma"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  let allowedModules: string[] = []
  
  if (session?.user) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true },
    })

    if (user?.role?.name === "ADMIN" || user?.role?.name === "Admin") {
      // Admin sees everything
      allowedModules = ["ALL"]
    } else {
      const perms = await getUserPermissions(session.user.id)
      // Any module they have VIEW access to
      allowedModules = perms
        .filter((p) => p.action === "VIEW")
        .map((p) => p.module)
    }
  }

  return <ClientLayout allowedModules={allowedModules}>{children}</ClientLayout>
}
