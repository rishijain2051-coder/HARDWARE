"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { unitSchema, UnitFormValues } from "./schema"
import { authorize } from "@/lib/dal"

export async function saveUnit(data: UnitFormValues) {
  const result = unitSchema.safeParse(data)
  
  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, name, abbreviation, isActive } = result.data

  // Creating and updating are separately grantable permissions.
  const gate = await authorize("UNIT_MASTER", id ? "EDIT" : "CREATE")
  if (!gate.success) return gate

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
  const gate = await authorize("UNIT_MASTER", "DELETE")
  if (!gate.success) return gate

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
