"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { supplierSchema, SupplierFormValues } from "./schema"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

export async function getSuppliers(search?: string) {
  return await prisma.supplier.findMany({
    where: search
      ? { name: { contains: search, mode: "insensitive" } }
      : undefined,
    orderBy: { name: "asc" },
  })
}

export async function saveSupplier(data: SupplierFormValues) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "SUPPLIER_MASTER", "EDIT"))) return { success: false, error: "Unauthorized" }

  const result = supplierSchema.safeParse(data)
  
  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, name, contactPerson, phone, email, gst, address, isActive } = result.data

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
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "SUPPLIER_MASTER", "EDIT"))) return { success: false, error: "Unauthorized" }

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
