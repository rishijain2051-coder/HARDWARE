"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { supplierSchema, SupplierFormValues } from "./schema"
import { authorize } from "@/lib/dal"

export async function getSuppliers(search?: string) {
  const gate = await authorize("SUPPLIER_MASTER", "VIEW")
  if (!gate.success) return []

  return await prisma.supplier.findMany({
    where: search
      ? { name: { contains: search, mode: "insensitive" } }
      : undefined,
    orderBy: { name: "asc" },
  })
}

export async function saveSupplier(data: SupplierFormValues) {
  const result = supplierSchema.safeParse(data)
  
  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, name, contactPerson, phone, email, gst, address, isActive } = result.data

  // Creating and updating are separately grantable permissions.
  const gate = await authorize("SUPPLIER_MASTER", id ? "EDIT" : "CREATE")
  if (!gate.success) return gate

  try {
    if (id) {
      await prisma.supplier.update({
        where: { id },
        data: { name, contactPerson, phone, email: email || null, gst, address, isActive },
      })
    } else {
      await prisma.supplier.create({
        data: { name, contactPerson, phone, email: email || null, gst, address, isActive },
      })
    }
    revalidatePath("/masters/suppliers")
    return { success: true }
  } catch (error: any) {
    return { success: false, error: "Failed to save supplier" }
  }
}

export async function deleteSupplier(id: string) {
  const gate = await authorize("SUPPLIER_MASTER", "DELETE")
  if (!gate.success) return gate

  try {
    await prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    })
    revalidatePath("/masters/suppliers")
    return { success: true }
  } catch (error) {
    return { success: false, error: "Failed to delete supplier" }
  }
}
