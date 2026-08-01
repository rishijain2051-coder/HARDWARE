"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { hashPassword } from "better-auth/crypto"

import { authorize, getCurrentUser } from "@/lib/dal"
import {
  isModuleKey,
  isPermissionAction,
  PERMISSION_CATALOG,
  permissionKey,
} from "@/lib/permissions"

/**
 * Brings the `permissions` table in line with the module registry:
 * inserts anything new, refreshes descriptions, and deletes rows that are no
 * longer grantable so they cannot linger on a role and silently mean nothing.
 */
export async function syncPermissions() {
  const gate = await authorize("USER_MANAGEMENT", "EDIT")
  if (!gate.success) return gate

  for (const perm of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { module_action: { module: perm.module, action: perm.action } },
      update: { description: perm.description },
      create: {
        module: perm.module,
        action: perm.action,
        description: perm.description,
      },
    })
  }

  const existing = await prisma.permission.findMany({
    select: { id: true, module: true, action: true },
  })
  const valid = new Set(
    PERMISSION_CATALOG.map((p) => permissionKey(p.module, p.action))
  )
  const stale = existing.filter(
    (p) => !valid.has(permissionKey(p.module, p.action))
  )
  if (stale.length > 0) {
    await prisma.permission.deleteMany({
      where: { id: { in: stale.map((p) => p.id) } },
    })
  }

  revalidatePath("/users")
  return { success: true, removed: stale.length }
}

export async function getPermissions() {
  const gate = await authorize("USER_MANAGEMENT", "VIEW")
  if (!gate.success) return []

  const rows = await prisma.permission.findMany({
    orderBy: [{ module: "asc" }, { action: "asc" }],
  })

  // Never hand the editor a permission the registry no longer recognises.
  return rows.filter((p) => isModuleKey(p.module) && isPermissionAction(p.action))
}

export async function getUsers() {
  // This exposes every account in the system; it previously ran with no check.
  const gate = await authorize("USER_MANAGEMENT", "VIEW")
  if (!gate.success) return []

  return await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      roleId: true,
      createdAt: true,
      role: { select: { name: true, isSuperAdmin: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getRoles() {
  const gate = await authorize("USER_MANAGEMENT", "VIEW")
  if (!gate.success) return []

  return await prisma.role.findMany({
    include: {
      permissions: { select: { permissionId: true } },
      _count: { select: { users: true } },
    },
    orderBy: [{ isSuperAdmin: "desc" }, { name: "asc" }],
  })
}

export async function saveRole(data: {
  id?: string
  name: string
  description?: string
  permissionIds: string[]
}) {
  const gate = await authorize("USER_MANAGEMENT", data.id ? "EDIT" : "CREATE")
  if (!gate.success) return gate

  const name = data.name?.trim()
  if (!name) return { success: false, error: "Role name is required" }

  try {
    if (data.id) {
      const existing = await prisma.role.findUnique({
        where: { id: data.id },
        select: { isSuperAdmin: true, isSystem: true, name: true },
      })
      if (!existing) return { success: false, error: "Role not found" }

      // The super-admin role bypasses every check, so letting it be edited
      // (or renamed into something innocuous) would be a way to quietly
      // escalate or destroy access for everyone.
      if (existing.isSuperAdmin) {
        return {
          success: false,
          error: "The administrator role has full access by definition and cannot be edited.",
        }
      }

      // Locking yourself out of user management is unrecoverable without
      // database access, so block the specific edit that would do it.
      if (data.id === gate.user.role.id) {
        const keeps = await roleKeepsUserManagement(data.permissionIds)
        if (!keeps) {
          return {
            success: false,
            error:
              "You cannot remove Users & Roles access from your own role — you would lock yourself out.",
          }
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.role.update({
          where: { id: data.id },
          // System roles keep their name; only the description and grants move.
          data: existing.isSystem
            ? { description: data.description }
            : { name, description: data.description },
        })
        await tx.rolePermission.deleteMany({ where: { roleId: data.id } })
        if (data.permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: data.permissionIds.map((p) => ({
              roleId: data.id!,
              permissionId: p,
            })),
          })
        }
      })
    } else {
      await prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: { name, description: data.description },
        })
        if (data.permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: data.permissionIds.map((p) => ({
              roleId: role.id,
              permissionId: p,
            })),
          })
        }
      })
    }

    revalidatePath("/users")
    return { success: true }
  } catch (error: any) {
    if (error.code === "P2002") {
      return { success: false, error: "A role with this name already exists" }
    }
    return { success: false, error: "Failed to save role: " + error.message }
  }
}

/** True when the given permission ids still include USER_MANAGEMENT:VIEW + EDIT. */
async function roleKeepsUserManagement(permissionIds: string[]) {
  if (permissionIds.length === 0) return false
  const perms = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
    select: { module: true, action: true },
  })
  const keys = new Set(perms.map((p) => permissionKey(p.module, p.action)))
  return (
    keys.has(permissionKey("USER_MANAGEMENT", "VIEW")) &&
    keys.has(permissionKey("USER_MANAGEMENT", "EDIT"))
  )
}

export async function deleteRole(id: string) {
  const gate = await authorize("USER_MANAGEMENT", "DELETE")
  if (!gate.success) return gate

  const role = await prisma.role.findUnique({
    where: { id },
    select: {
      isSystem: true,
      isSuperAdmin: true,
      name: true,
      _count: { select: { users: true } },
    },
  })
  if (!role) return { success: false, error: "Role not found" }

  if (role.isSystem || role.isSuperAdmin) {
    return { success: false, error: `"${role.name}" is a built-in role and cannot be deleted.` }
  }
  if (id === gate.user.role.id) {
    return { success: false, error: "You cannot delete the role you are signed in with." }
  }
  if (role._count.users > 0) {
    return {
      success: false,
      error: `"${role.name}" still has ${role._count.users} user(s). Reassign them first.`,
    }
  }

  try {
    await prisma.role.delete({ where: { id } })
    revalidatePath("/users")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to delete role" }
  }
}

export async function changeUserPassword(userId: string, newPassword: string) {
  const actor = await getCurrentUser()
  if (!actor) {
    return { success: false, error: "Your session has expired. Please sign in again." }
  }

  // Users may always change their own password; changing someone else's
  // requires user-management rights.
  if (actor.id !== userId) {
    const gate = await authorize("USER_MANAGEMENT", "EDIT")
    if (!gate.success) return gate
  }

  if (!userId || !newPassword) {
    return { success: false, error: "Missing required fields" }
  }

  try {
    const passwordHash = await hashPassword(newPassword)

    const account = await prisma.account.findFirst({
      where: { userId, providerId: "credential" },
    })

    if (account) {
      await prisma.account.update({
        where: { id: account.id },
        data: { password: passwordHash },
      })
    } else {
      await prisma.account.create({
        data: {
          userId,
          accountId: userId,
          providerId: "credential",
          password: passwordHash,
        },
      })
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: "Failed to change password: " + error.message }
  }
}

export async function saveUser(data: {
  id?: string
  name: string
  email: string
  roleId: string
  isActive: boolean
  password?: string
}) {
  const gate = await authorize("USER_MANAGEMENT", data.id ? "EDIT" : "CREATE")
  if (!gate.success) return gate

  if (!data.name || !data.email || !data.roleId) {
    return { success: false, error: "Missing required fields" }
  }

  // Better Auth lower-cases the address before looking an account up at sign-in,
  // so storing it verbatim would create a user who can never log in — entering
  // "John.Doe@Company.com" here produced a permanently unusable account.
  const email = data.email.trim().toLowerCase()
  const name = data.name.trim()

  // Only a super admin may hand out the super-admin role, otherwise anyone with
  // user-management rights could promote themselves to unrestricted access.
  const targetRole = await prisma.role.findUnique({
    where: { id: data.roleId },
    select: { isSuperAdmin: true, name: true },
  })
  if (!targetRole) return { success: false, error: "Selected role no longer exists" }
  if (targetRole.isSuperAdmin && !gate.access.isSuperAdmin) {
    return {
      success: false,
      error: `Only an administrator can assign the "${targetRole.name}" role.`,
    }
  }

  // Deactivating or demoting yourself mid-session locks you out immediately,
  // since the access layer rejects inactive accounts.
  if (data.id === gate.user.id) {
    if (!data.isActive) {
      return { success: false, error: "You cannot deactivate your own account." }
    }
    if (data.roleId !== gate.user.role.id) {
      return { success: false, error: "You cannot change your own role." }
    }
  }

  try {
    let userId = data.id
    if (userId) {
      const clash = await prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
        select: { id: true },
      })
      if (clash) return { success: false, error: "Another user already has this email" }

      await prisma.user.update({
        where: { id: userId },
        data: { name, email, roleId: data.roleId, isActive: data.isActive },
      })
    } else {
      const exists = await prisma.user.findUnique({ where: { email } })
      if (exists) return { success: false, error: "User with this email already exists" }

      const user = await prisma.user.create({
        data: { name, email, roleId: data.roleId, isActive: data.isActive },
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
