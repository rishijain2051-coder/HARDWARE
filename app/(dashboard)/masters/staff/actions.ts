"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { staffSchema, StaffFormValues } from "./schema"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export async function getStaff(search?: string) {
  return await prisma.staff.findMany({
    where: search
      ? { name: { contains: search, mode: "insensitive" } }
      : undefined,
    orderBy: { name: "asc" },
  })
}

export async function saveStaff(data: StaffFormValues) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "STAFF_MASTER", "EDIT"))) return { success: false, error: "Unauthorized" }

  const result = staffSchema.safeParse(data)
  
  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, name, department, employeeCode, phone, isActive } = result.data

  try {
    if (id) {
      await prisma.staff.update({
        where: { id },
        data: { name, department, employeeCode, phone, isActive },
      })
    } else {
      await prisma.staff.create({
        data: { name, department, employeeCode, phone, isActive },
      })
    }
    revalidatePath("/masters/staff")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: "Failed to save staff" }
  }
}

export async function deleteStaff(id: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "STAFF_MASTER", "EDIT"))) return { success: false, error: "Unauthorized" }

  try {
    await prisma.staff.update({
      where: { id },
      data: { isActive: false },
    })
    revalidatePath("/masters/staff")
    return { success: true }
  } catch (error) {
    return { success: false, error: "Failed to delete staff" }
  }
}
