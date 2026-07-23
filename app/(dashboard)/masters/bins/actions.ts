"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { binSchema, BinFormValues } from "./schema"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export async function getBins() {
  return await prisma.bin.findMany({
    orderBy: { name: "asc" },
  })
}

export async function saveBin(data: BinFormValues) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT"))) return { success: false, error: "Unauthorized" }

  const result = binSchema.safeParse(data)
  
  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, name, location, isActive } = result.data

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
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT"))) return { success: false, error: "Unauthorized" }

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
