import { prisma } from "@/lib/prisma"

export async function getUserPermissions(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true }
          }
        }
      }
    }
  })

  if (!user || !user.role) return []

  return user.role.permissions.map(rp => rp.permission)
}

export async function hasPermission(userId: string, module: string, action: string) {
  // Check if Admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true }
  })
  
  if (user?.role?.name === "ADMIN" || user?.role?.name === "Admin") {
    return true // Admins can do everything
  }

  const permissions = await getUserPermissions(userId)
  return permissions.some(p => p.module === module && p.action === action)
}

// Used by prisma/seed.ts to assign default permissions to roles
export const PERMISSION_MATRIX: Record<string, { module: string; action: string }[]> = {
  Admin: [
    { module: "INWARD_RECORD", action: "VIEW" },
    { module: "INWARD_RECORD", action: "EDIT" },
    { module: "OUTWARD_RECORD", action: "VIEW" },
    { module: "OUTWARD_RECORD", action: "EDIT" },
    { module: "STORE_LOG", action: "VIEW" },
    { module: "STORE_LOG", action: "EDIT" },
    { module: "SUPPLIER_MASTER", action: "VIEW" },
    { module: "SUPPLIER_MASTER", action: "EDIT" },
    { module: "STAFF_MASTER", action: "VIEW" },
    { module: "STAFF_MASTER", action: "EDIT" },
    { module: "HARDWARE_MASTER", action: "VIEW" },
    { module: "HARDWARE_MASTER", action: "EDIT" },
    { module: "REPORTS", action: "VIEW" },
    { module: "USER_MANAGEMENT", action: "VIEW" },
    { module: "USER_MANAGEMENT", action: "EDIT" },
  ],
  "Store Manager": [
    { module: "INWARD_RECORD", action: "VIEW" },
    { module: "INWARD_RECORD", action: "EDIT" },
    { module: "OUTWARD_RECORD", action: "VIEW" },
    { module: "OUTWARD_RECORD", action: "EDIT" },
    { module: "STORE_LOG", action: "VIEW" },
    { module: "SUPPLIER_MASTER", action: "VIEW" },
    { module: "STAFF_MASTER", action: "VIEW" },
    { module: "HARDWARE_MASTER", action: "VIEW" },
    { module: "REPORTS", action: "VIEW" },
  ],
}
