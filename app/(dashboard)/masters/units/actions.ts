"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { unitSchema, UnitFormValues } from "./schema"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export async function getUnits() {
  return await prisma.unit.findMany({
    orderBy: { name: "asc" },
  })
}

export async function saveUnit(data: UnitFormValues) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT"))) return { success: false, error: "Unauthorized" }

  const result = unitSchema.safeParse(data)
  
  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, name, abbreviation, isActive } = result.data

  try {
    if (id) {
      await prisma.unit.update({
        where: { id },
        data: { name, abbreviation, isActive },
      })
    } else {
      await prisma.unit.create({
        data: { name, abbreviation, isActive },
      })
    }
    revalidatePath("/masters/units")
    return { success: true }
  } catch (error: any) {
    if (error.code === "P2002") {
      return { success: false, error: "Unit name already exists" }
    }
    return { success: false, error: "Failed to save unit" }
  }
}

export async function deleteUnit(id: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT"))) return { success: false, error: "Unauthorized" }

  try {
    await prisma.unit.update({
      where: { id },
      data: { isActive: false },
    })
    revalidatePath("/masters/units")
    return { success: true }
  } catch (error) {
    return { success: false, error: "Failed to delete unit" }
  }
}
