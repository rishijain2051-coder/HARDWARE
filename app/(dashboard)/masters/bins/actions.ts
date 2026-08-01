"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { binSchema, BinFormValues } from "./schema"
import { authorize } from "@/lib/dal"

export async function getBins() {
  const gate = await authorize("BIN_MASTER", "VIEW")
  if (!gate.success) return []

  return await prisma.bin.findMany({
    orderBy: { name: "asc" },
  })
}

export async function saveBin(data: BinFormValues) {
  const result = binSchema.safeParse(data)
  
  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, name, location, isActive } = result.data

  // Creating and updating are separately grantable permissions.
  const gate = await authorize("BIN_MASTER", id ? "EDIT" : "CREATE")
  if (!gate.success) return gate

  try {
    if (id) {
      await prisma.bin.update({
        where: { id },
        data: { name, location, isActive },
      })
    } else {
      await prisma.bin.create({
        data: { name, location, isActive },
      })
    }
    revalidatePath("/masters/bins")
    return { success: true }
  } catch (error: any) {
    if (error.code === "P2002") {
      return { success: false, error: "Bin name already exists" }
    }
    return { success: false, error: "Failed to save bin" }
  }
}

export async function deleteBin(id: string) {
  const gate = await authorize("BIN_MASTER", "DELETE")
  if (!gate.success) return gate

  try {
    await prisma.bin.update({
      where: { id },
      data: { isActive: false },
    })
    revalidatePath("/masters/bins")
    return { success: true }
  } catch (error) {
    return { success: false, error: "Failed to delete bin" }
  }
}
