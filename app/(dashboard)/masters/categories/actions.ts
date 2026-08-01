"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { categorySchema, CategoryFormValues } from "./schema"
import { authorize } from "@/lib/dal"

export async function getCategories() {
  const gate = await authorize("CATEGORY_MASTER", "VIEW")
  if (!gate.success) return []

  return await prisma.category.findMany({
    orderBy: { name: "asc" },
  })
}

export async function saveCategory(data: CategoryFormValues) {
  const result = categorySchema.safeParse(data)
  
  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, name, isActive } = result.data

  // Creating and updating are separately grantable permissions.
  const gate = await authorize("CATEGORY_MASTER", id ? "EDIT" : "CREATE")
  if (!gate.success) return gate

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
  const gate = await authorize("CATEGORY_MASTER", "DELETE")
  if (!gate.success) return gate

  try {
    // Check if category is used in products
    const productsCount = await prisma.hardwareProduct.count({
      where: { categoryId: id },
    })
    
    if (productsCount > 0) {
      return { success: false, error: "Cannot delete category linked to products" }
    }

    // Hard delete since it's not linked to any products
    await prisma.category.delete({
      where: { id },
    })
    revalidatePath("/masters/categories")
    return { success: true }
  } catch (error) {
    return { success: false, error: "Failed to delete category" }
  }
}
