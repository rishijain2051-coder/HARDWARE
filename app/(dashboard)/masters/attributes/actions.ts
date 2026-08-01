"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { attributeSchema, AttributeFormValues } from "./schema"
import { authorize } from "@/lib/dal"

export async function getAttributes() {
  const gate = await authorize("ATTRIBUTE_MASTER", "VIEW")
  if (!gate.success) return []

  return await prisma.attribute.findMany({
    orderBy: { name: "asc" },
  })
}

export async function saveAttribute(data: AttributeFormValues) {
  const result = attributeSchema.safeParse(data)
  
  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, name, type, isRequired, isSearchable, options } = result.data

  // Creating and updating are separately grantable permissions.
  const gate = await authorize("ATTRIBUTE_MASTER", id ? "EDIT" : "CREATE")
  if (!gate.success) return gate

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
  const gate = await authorize("ATTRIBUTE_MASTER", "DELETE")
  if (!gate.success) return gate

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
