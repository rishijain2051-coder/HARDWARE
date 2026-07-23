"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { categorySchema, CategoryFormValues } from "./schema"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export async function getCategories() {
  return await prisma.category.findMany({
    orderBy: { name: "asc" },
  })
}

export async function saveCategory(data: CategoryFormValues) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT"))) return { success: false, error: "Unauthorized" }

  const result = categorySchema.safeParse(data)
  
  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, name, isActive } = result.data

  try {
    if (id) {
      await prisma.category.update({
        where: { id },
        data: { name, isActive },
      })
    } else {
      await prisma.category.create({
        data: { name, isActive },
      })
    }
    revalidatePath("/masters/categories")
    return { success: true }
  } catch (error: any) {
    if (error.code === "P2002") {
      return { success: false, error: "Category name already exists" }
    }
    return { success: false, error: "Failed to save category" }
  }
}

export async function deleteCategory(id: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT"))) return { success: false, error: "Unauthorized" }

  try {
    // Check if category is used in products
    const productsCount = await prisma.hardwareProduct.count({
      where: { categoryId: id },
    })
    
    if (productsCount > 0) {
      return { success: false, error: "Cannot delete category linked to products" }
    }

    // Soft delete is preferred in ERP, or we could hard delete if not linked
    // Let's do a soft delete for safety
    await prisma.category.update({
      where: { id },
      data: { isActive: false },
    })
    revalidatePath("/masters/categories")
    return { success: true }
  } catch (error) {
    return { success: false, error: "Failed to delete category" }
  }
}
