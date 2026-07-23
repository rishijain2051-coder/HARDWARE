"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { attributeSchema, AttributeFormValues } from "./schema"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export async function getAttributes() {
  return await prisma.attribute.findMany({
    orderBy: { name: "asc" },
  })
}

export async function saveAttribute(data: AttributeFormValues) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT"))) return { success: false, error: "Unauthorized" }

  const result = attributeSchema.safeParse(data)
  
  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, name, type, isRequired, isSearchable, options } = result.data

  try {
    if (id) {
      await prisma.attribute.update({
        where: { id },
        data: { name, type, isRequired, isSearchable, options },
      })
    } else {
      await prisma.attribute.create({
        data: { name, type, isRequired, isSearchable, options },
      })
    }
    revalidatePath("/masters/attributes")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: "Failed to save attribute" }
  }
}

export async function deleteAttribute(id: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "HARDWARE_MASTER", "EDIT"))) return { success: false, error: "Unauthorized" }

  try {
    const valuesCount = await prisma.productAttributeValue.count({
      where: { attributeId: id },
    })
    await prisma.attribute.delete({
      where: { id },
    })
    revalidatePath("/masters/attributes")
    return { success: true }
  } catch (error) {
    return { success: false, error: "Failed to delete attribute. It might be in use." }
  }
}
