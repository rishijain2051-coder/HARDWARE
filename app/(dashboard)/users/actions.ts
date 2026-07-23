"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { hashPassword } from "better-auth/crypto"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

const REQUIRED_PERMISSIONS = [
  { module: "INWARD_RECORD", action: "VIEW", description: "View GRN" },
  { module: "INWARD_RECORD", action: "EDIT", description: "Create/Edit GRN" },
  { module: "OUTWARD_RECORD", action: "VIEW", description: "View MIS" },
  { module: "OUTWARD_RECORD", action: "EDIT", description: "Create/Edit MIS" },
  { module: "STORE_LOG", action: "VIEW", description: "View Store Logs" },
  { module: "STORE_LOG", action: "EDIT", description: "Edit Store Logs" },
  { module: "SUPPLIER_MASTER", action: "VIEW", description: "View Suppliers" },
  { module: "SUPPLIER_MASTER", action: "EDIT", description: "Manage Suppliers" },
  { module: "STAFF_MASTER", action: "VIEW", description: "View Staff" },
  { module: "STAFF_MASTER", action: "EDIT", description: "Manage Staff" },
  { module: "HARDWARE_MASTER", action: "VIEW", description: "View Hardware" },
  { module: "HARDWARE_MASTER", action: "EDIT", description: "Manage Hardware" },
  { module: "REPORTS", action: "VIEW", description: "View Reports" },
  { module: "USER_MANAGEMENT", action: "VIEW", description: "View Users/Roles" },
  { module: "USER_MANAGEMENT", action: "EDIT", description: "Manage Users/Roles" },
]

export async function syncPermissions() {
  for (const perm of REQUIRED_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { module_action: { module: perm.module, action: perm.action } },
      update: { description: perm.description },
      create: { module: perm.module, action: perm.action, description: perm.description },
    })
  }
}

export async function getPermissions() {
  return await prisma.permission.findMany({
    orderBy: [{ module: "asc" }, { action: "asc" }],
  })
}

export async function getUsers() {
  return await prisma.user.findMany({
    include: { role: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  })
}

export async function getRoles() {
  return await prisma.role.findMany({
    include: {
      permissions: { select: { permissionId: true } },
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  })
}

export async function saveRole(data: { id?: string; name: string; description?: string; permissionIds: string[] }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "USER_MANAGEMENT", "EDIT"))) return { success: false, error: "Unauthorized" }

  if (!data.name) return { success: false, error: "Role name is required" }

  try {
    if (data.id) {
      await prisma.$transaction(async (tx) => {
        await tx.role.update({
          where: { id: data.id },
          data: { name: data.name, description: data.description },
        })
        await tx.rolePermission.deleteMany({ where: { roleId: data.id } })
        if (data.permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: data.permissionIds.map((p) => ({ roleId: data.id!, permissionId: p })),
          })
        }
      })
    } else {
      await prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: { name: data.name, description: data.description },
        })
        if (data.permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: data.permissionIds.map((p) => ({ roleId: role.id, permissionId: p })),
          })
        }
      })
    }
    revalidatePath("/users")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: "Failed to save role: " + error.message }
  }
}

export async function changeUserPassword(userId: string, newPassword: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  
  // They can change their own password, OR they need EDIT permission for USER_MANAGEMENT
  const isSelf = session.user.id === userId
  if (!isSelf && !(await hasPermission(session.user.id, "USER_MANAGEMENT", "EDIT"))) {
    return { success: false, error: "Unauthorized" }
  }

  if (!userId || !newPassword) return { success: false, error: "Missing required fields" }

  try {
    const passwordHash = await hashPassword(newPassword)
    
    const account = await prisma.account.findFirst({
      where: { userId, providerId: "credential" }
    })

    if (account) {
      await prisma.account.update({
        where: { id: account.id },
        data: { password: passwordHash }
      })
    } else {
      await prisma.account.create({
        data: {
          userId,
          accountId: userId,
          providerId: "credential",
          password: passwordHash
        }
      })
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: "Failed to change password: " + error.message }
  }
}

export async function saveUser(data: { id?: string; name: string; email: string; roleId: string; isActive: boolean; password?: string }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "USER_MANAGEMENT", "EDIT"))) return { success: false, error: "Unauthorized" }

  if (!data.name || !data.email || !data.roleId) return { success: false, error: "Missing required fields" }

  try {
    let userId = data.id
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          name: data.name,
          email: data.email,
          roleId: data.roleId,
          isActive: data.isActive,
        },
      })
    } else {
      const exists = await prisma.user.findUnique({ where: { email: data.email } })
      if (exists) return { success: false, error: "User with this email already exists" }

      const user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          roleId: data.roleId,
          isActive: data.isActive,
        },
      })
      userId = user.id
    }

    if (data.password) {
      const passResult = await changeUserPassword(userId, data.password)
      if (!passResult.success) {
        return passResult
      }
    }

    revalidatePath("/users")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: "Failed to save user: " + error.message }
  }
}
