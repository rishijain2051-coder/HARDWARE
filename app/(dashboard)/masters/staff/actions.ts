"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { staffSchema, StaffFormValues } from "./schema"
import { authorize } from "@/lib/dal"

export async function getStaff(search?: string) {
  const gate = await authorize("STAFF_MASTER", "VIEW")
  if (!gate.success) return []

  return await prisma.staff.findMany({
    where: search
      ? { name: { contains: search, mode: "insensitive" } }
      : undefined,
    orderBy: { name: "asc" },
  })
}

export async function saveStaff(data: StaffFormValues) {
  const result = staffSchema.safeParse(data)
  
  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, name, department, employeeCode, phone, isActive } = result.data

  // Creating and updating are separately grantable permissions.
  const gate = await authorize("STAFF_MASTER", id ? "EDIT" : "CREATE")
  if (!gate.success) return gate

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
  const gate = await authorize("STAFF_MASTER", "DELETE")
  if (!gate.success) return gate

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
