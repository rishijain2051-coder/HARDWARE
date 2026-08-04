"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { productSchema, ProductFormValues } from "./schema"
import { authorize } from "@/lib/dal"
import { TXN_LABELS } from "@/lib/labels"

// Generate SKU: CAT-NNNN format
async function generateSku(categoryId: string): Promise<string> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } })
  const prefix = category
    ? category.name.substring(0, 3).toUpperCase()
    : "GEN"

  const lastProduct = await prisma.hardwareProduct.findFirst({
    where: { sku: { startsWith: prefix + "-" } },
    orderBy: { sku: "desc" },
  })

  let nextNum = 1
  if (lastProduct) {
    const match = lastProduct.sku.match(/-(\d+)$/)
    if (match) nextNum = parseInt(match[1]) + 1
  }

  return `${prefix}-${String(nextNum).padStart(4, "0")}`
}

export async function getProducts({
  search,
  categoryId,
  isActive,
}: {
  search?: string
  categoryId?: string
  isActive?: boolean
} = {}) {
  const gate = await authorize("PRODUCT_MASTER", "VIEW")
  if (!gate.success) return []

  const where: any = {}

  if (categoryId) where.categoryId = categoryId
  if (typeof isActive === "boolean") where.isActive = isActive

  if (search) {
    const keywords = search.split(/\s+/).filter(Boolean)
    if (keywords.length > 0) {
      where.AND = keywords.map((kw) => ({
        OR: [
          { sku: { contains: kw, mode: "insensitive" } },
          { description: { contains: kw, mode: "insensitive" } },
          { aliases: { some: { alias: { contains: kw, mode: "insensitive" } } } },
          { attributeValues: { some: { value: { contains: kw, mode: "insensitive" } } } },
        ],
      }))
    }
  }

  return await prisma.hardwareProduct.findMany({
    where,
    include: {
      category: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true, abbreviation: true } },
      defaultBin: { select: { id: true, name: true } },
      aliases: { select: { id: true, alias: true } },
      attributeValues: {
        include: { attribute: { select: { id: true, name: true, type: true } } },
      },
    },
    orderBy: { sku: "asc" },
  })
}

export async function getProductById(id: string) {
  const gate = await authorize("PRODUCT_MASTER", "VIEW")
  if (!gate.success) return null

  return await prisma.hardwareProduct.findUnique({
    where: { id },
    include: {
      category: true,
      unit: true,
      defaultBin: true,
      aliases: true,
      attributeValues: {
        include: { attribute: true },
      },
    },
  })
}

export async function saveProduct(data: ProductFormValues) {
  const result = productSchema.safeParse(data)
  if (!result.success) {
    return { success: false, error: result.error.issues[0]?.message || "Invalid data" }
  }

  const {
    id,
    description,
    categoryId,
    unitId,
    finish,
    size,
    minStock,
    openingStock,
    defaultBinId,
    isActive,
    aliases,
    attributes,
  } = result.data

  // Creating and updating are separately grantable permissions.
  const gate = await authorize("PRODUCT_MASTER", id ? "EDIT" : "CREATE")
  if (!gate.success) return gate

  let { sku } = result.data

  try {
    if (id) {
      // Update
      const duplicate = await prisma.hardwareProduct.findFirst({
        where: {
          description: { equals: description, mode: "insensitive" },
          categoryId,
          id: { not: id },
        },
      })
      if (duplicate) {
        return { success: false, error: `Product "${description}" already exists in this category (SKU: ${duplicate.sku})` }
      }

      await prisma.$transaction(async (tx) => {
        await tx.hardwareProduct.update({
          where: { id },
          data: {
            sku: sku || undefined,
            description,
            categoryId,
            unitId,
            finish: finish || null,
            size: size || null,
            minStock,
            defaultBinId: defaultBinId || null,
            isActive,
          },
        })

        // Update aliases
        await tx.productAlias.deleteMany({ where: { productId: id } })
        if (aliases.length > 0) {
          await tx.productAlias.createMany({
            data: aliases
              .filter((a) => a.trim().length > 0)
              .map((alias) => ({ productId: id, alias: alias.trim() })),
          })
        }

        // Update attribute values
        await tx.productAttributeValue.deleteMany({ where: { productId: id } })
        if (attributes.length > 0) {
          await tx.productAttributeValue.createMany({
            data: attributes
              .filter((a) => a.value.trim().length > 0)
              .map((attr) => ({
                productId: id,
                attributeId: attr.attributeId,
                value: attr.value.trim(),
              })),
          })
        }
      })
    } else {
      // Create
      const finalSku = sku ? sku : await generateSku(categoryId)

      const existing = await prisma.hardwareProduct.findUnique({ where: { sku: finalSku } })
      if (existing) {
        return { success: false, error: `SKU "${finalSku}" already exists` }
      }

      const duplicate = await prisma.hardwareProduct.findFirst({
        where: {
          description: { equals: description, mode: "insensitive" },
          categoryId,
        },
      })
      if (duplicate) {
        return { success: false, error: `Product "${description}" already exists in this category (SKU: ${duplicate.sku})` }
      }

      await prisma.$transaction(async (tx) => {
        const product = await tx.hardwareProduct.create({
          data: {
            sku: finalSku,
            description,
            categoryId,
            unitId,
            finish: finish || null,
            size: size || null,
            minStock,
            openingStock,
            currentStock: openingStock,
            defaultBinId: defaultBinId || null,
            isActive,
          },
        })

        if (aliases.length > 0) {
          await tx.productAlias.createMany({
            data: aliases
              .filter((a) => a.trim().length > 0)
              .map((alias) => ({ productId: product.id, alias: alias.trim() })),
          })
        }

        if (attributes.length > 0) {
          await tx.productAttributeValue.createMany({
            data: attributes
              .filter((a) => a.value.trim().length > 0)
              .map((attr) => ({
                productId: product.id,
                attributeId: attr.attributeId,
                value: attr.value.trim(),
              })),
          })
        }

        // If opening stock > 0, create store log entry.
        // Attributed to the signed-in user. This used to lazily create a
        // synthetic "System" account holding an ADMIN role — a real super-admin
        // row, complete with a login, minted as a side effect of adding a
        // product. The same pattern was removed from saveGrn/saveMis.
        if (openingStock > 0) {
          await tx.storeLog.create({
            data: {
              transactionType: "OPENING",
              referenceNumber: `OPENING-${finalSku}`,
              productId: product.id,
              quantity: openingStock,
              balanceAfter: openingStock,
              createdById: gate.user.id,
            },
          })
        }
      })
    }

    revalidatePath("/masters/products")
    return { success: true }
  } catch (error: any) {
    console.error("Save product error:", error)
    if (error.code === "P2002") {
      return { success: false, error: "A product with this SKU already exists" }
    }
    return { success: false, error: `Failed to save product: ${error.message || error}` }
  }
}

export async function deleteProduct(id: string, hardDelete: boolean = false) {
  const gate = await authorize("PRODUCT_MASTER", "DELETE")
  if (!gate.success) return gate

  try {
    if (hardDelete) {
      // Irreversible removal, as opposed to deactivation, stays with super admins.
      if (!gate.access.isSuperAdmin) {
        return { success: false, error: "Only administrators can permanently delete records." }
      }

      await prisma.hardwareProduct.delete({
        where: { id }
      })
    } else {
      await prisma.hardwareProduct.update({
        where: { id },
        data: { isActive: false },
      })
    }
    
    revalidatePath("/masters/products")
    return { success: true }
  } catch (error: any) {
    if (error.code === 'P2003') {
      return { success: false, error: `Cannot permanently delete this product because it has existing transactions (${TXN_LABELS.inward}, ${TXN_LABELS.outward}, or Logs). Delete the transactions first.` }
    }
    return { success: false, error: hardDelete ? "Failed to permanently delete product" : "Failed to deactivate product" }
  }
}

// The form's reference lists (categories, units, bins, attributes) are no longer
// read here. They are served from the browser cache via `fetchLookups` in
// lib/lookups/actions.ts, which is also where their permission gates live.

export async function searchProducts(query: string) {
  const gate = await authorize("PRODUCT_MASTER", "VIEW")
  if (!gate.success) return []

  if (!query || query.length < 2) return []

  const tokens = query.toLowerCase().split(/[\s,]+/).filter(Boolean)
  if (tokens.length === 0) return []

  const conditions: any[] = tokens.map((token) => ({
    OR: [
      { sku: { contains: token, mode: "insensitive" } },
      { description: { contains: token, mode: "insensitive" } },
      { aliases: { some: { alias: { contains: token, mode: "insensitive" } } } },
    ],
  }))

  return await prisma.hardwareProduct.findMany({
    where: {
      isActive: true,
      AND: conditions,
    },
    include: {
      unit: { select: { name: true, abbreviation: true } },
      category: { select: { name: true } },
    },
    take: 20,
    orderBy: { description: "asc" },
  })
}
