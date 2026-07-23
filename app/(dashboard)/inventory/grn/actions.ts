"use server"

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

async function generateGrnNumber(): Promise<string> {
  const now = new Date()
  const prefix = `GRN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`

  const last = await prisma.grnHeader.findFirst({
    where: { grnNumber: { startsWith: prefix } },
    orderBy: { grnNumber: "desc" },
  })

  let seq = 1
  if (last) {
    const match = last.grnNumber.match(/-(\d+)$/)
    if (match) seq = parseInt(match[1]) + 1
  }

  return `${prefix}-${String(seq).padStart(4, "0")}`
}

export async function getGrnList() {
  return await prisma.grnHeader.findMany({
    where: { isDeleted: false },
    include: {
      supplier: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { date: "desc" },
    take: 500,
  })
}

export async function getGrnById(id: string) {
  return await prisma.grnHeader.findUnique({
    where: { id },
    include: {
      supplier: true,
      createdBy: { select: { name: true } },
      items: {
        include: {
          product: { select: { id: true, sku: true, description: true, currentStock: true } },
          bin: { select: { id: true, name: true } },
        },
      },
    },
  })
}

interface GrnItemInput {
  productId: string
  quantity: number
  baseQuantity: number
  purchaseUnitName?: string
  conversionFactor: number
  rate: number
  binId?: string
}

export async function saveGrn(data: {
  supplierId: string
  invoiceNumber?: string
  invoiceDate?: string
  remarks?: string
  items: GrnItemInput[]
  createdById: string
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "INWARD_RECORD", "EDIT"))) return { success: false, error: "Unauthorized" }

  const { supplierId, invoiceNumber, invoiceDate, remarks, items, createdById } = data

  if (!supplierId) return { success: false, error: "Supplier is required" }
  if (!items || items.length === 0) return { success: false, error: "At least one item is required" }

  try {
    const grnNumber = await generateGrnNumber()

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let finalUserId = createdById
      if (!finalUserId || finalUserId === "system") {
        let sysUser = await tx.user.findFirst({ where: { email: "system@hardware.local" } })
        if (!sysUser) {
          let adminRole = await tx.role.findFirst({ where: { name: "ADMIN" } })
          if (!adminRole) {
            adminRole = await tx.role.create({ data: { name: "ADMIN", description: "Administrator" } })
          }
          sysUser = await tx.user.create({
            data: { email: "system@hardware.local", name: "System", roleId: adminRole.id },
          })
        }
        finalUserId = sysUser.id
      }

      // 1. Create GRN header
      const grn = await tx.grnHeader.create({
        data: {
          grnNumber,
          supplierId,
          invoiceNumber: invoiceNumber || null,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
          remarks: remarks || null,
          createdById: finalUserId,
        },
      })

      // 2. Create GRN items and update stock
      for (const item of items) {
        const grnItem = await tx.grnItem.create({
          data: {
            grnHeaderId: grn.id,
            productId: item.productId,
            quantity: item.quantity,
            baseQuantity: item.baseQuantity,
            purchaseUnitName: item.purchaseUnitName || null,
            conversionFactor: item.conversionFactor,
            rate: item.rate,
            binId: item.binId || null,
          },
        })

        // 3. Fetch current product to check rate bounds
        const currentProduct = await tx.hardwareProduct.findUniqueOrThrow({
          where: { id: item.productId },
          select: { lowestPurchaseRate: true, highestPurchaseRate: true },
        })

        // 4. Update product stock and purchase summary in one call
        const product = await tx.hardwareProduct.update({
          where: { id: item.productId },
          data: {
            currentStock: { increment: item.baseQuantity },
            lastPurchaseRate: item.rate,
            lastSupplierId: supplierId,
            lastPurchaseDate: new Date(),
            lastPurchaseQty: item.baseQuantity,
            lowestPurchaseRate:
              currentProduct.lowestPurchaseRate === null || item.rate < currentProduct.lowestPurchaseRate
                ? item.rate
                : undefined,
            highestPurchaseRate:
              currentProduct.highestPurchaseRate === null || item.rate > currentProduct.highestPurchaseRate
                ? item.rate
                : undefined,
          },
        })

        // 5. Create store log entry
        await tx.storeLog.create({
          data: {
            transactionType: "GRN",
            referenceNumber: grnNumber,
            productId: item.productId,
            quantity: item.baseQuantity,
            balanceAfter: product.currentStock,
            supplierId,
            createdById: finalUserId,
          },
        })

        // 6. Create purchase history
        await tx.purchaseHistory.create({
          data: {
            productId: item.productId,
            grnItemId: grnItem.id,
            supplierId,
            date: new Date(),
            rate: item.rate,
            quantity: item.baseQuantity,
            invoiceNumber: invoiceNumber || null,
          },
        })

        // 7. Update bin stock if bin specified
        if (item.binId) {
          await tx.binStock.upsert({
            where: {
              productId_binId: {
                productId: item.productId,
                binId: item.binId,
              },
            },
            create: {
              productId: item.productId,
              binId: item.binId,
              quantity: item.baseQuantity,
            },
            update: {
              quantity: { increment: item.baseQuantity },
            },
          })
        }
      }

      return grn
    })

    revalidatePath("/inventory/grn")
    return { success: true, grnNumber: result.grnNumber }
  } catch (error: any) {
    console.error("GRN save error:", error)
    return { success: false, error: "Failed to save GRN" }
  }
}

export async function deleteGrn(id: string, reason: string, userId: string) {
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const grn = await tx.grnHeader.findUnique({
        where: { id },
        include: { items: true },
      })
      if (!grn) throw new Error("GRN not found")

      // Reverse stock for each item
      for (const item of grn.items) {
        await tx.hardwareProduct.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: item.baseQuantity } },
        })

        if (item.binId) {
          await tx.binStock.update({
            where: {
              productId_binId: {
                productId: item.productId,
                binId: item.binId,
              },
            },
            data: { quantity: { decrement: item.baseQuantity } },
          })
        }

        // Reversal store log
        const product = await tx.hardwareProduct.findUnique({ where: { id: item.productId } })
        await tx.storeLog.create({
          data: {
            transactionType: "ADJUSTMENT",
            referenceNumber: `DEL-${grn.grnNumber}`,
            productId: item.productId,
            quantity: -item.baseQuantity,
            balanceAfter: product!.currentStock,
            supplierId: grn.supplierId,
            createdById: userId,
          },
        })
      }

      // Soft delete
      await tx.grnHeader.update({
        where: { id },
        data: { isDeleted: true, deleteReason: reason, deletedAt: new Date() },
      })
    })

    revalidatePath("/inventory/grn")
    return { success: true }
  } catch (error) {
    return { success: false, error: "Failed to delete GRN" }
  }
}

export async function hardDeleteGrn(id: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { role: true }
  })
  if (user?.role?.name !== "ADMIN" && user?.role?.name !== "Admin") {
    return { success: false, error: "Only Administrators can permanently delete records." }
  }

  try {
    const grn = await prisma.grnHeader.findUnique({
      where: { id },
      include: { items: true }
    })
    if (!grn) return { success: false, error: "GRN not found" }

    const productIdsToRebuild = new Set(grn.items.map(item => item.productId))

    // Start transaction for deleting data
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Delete associated Store Log entries
      await tx.storeLog.deleteMany({
        where: { referenceNumber: grn.grnNumber, transactionType: "GRN" }
      })

      // 2. Adjust Bin stocks back
      for (const item of grn.items) {
        if (item.binId) {
          await tx.binStock.update({
            where: {
              productId_binId: { productId: item.productId, binId: item.binId }
            },
            data: { quantity: { decrement: item.baseQuantity } }
          })
        }
      }

      // 3. The GrnHeader deletion will cascade and delete GrnItems and PurchaseHistory.
      await tx.grnHeader.delete({ where: { id } })
    })

    // Rebuild ledgers outside the transaction to avoid locking issues if it's long
    const { rebuildLedger } = await import("@/lib/ledger")
    for (const productId of productIdsToRebuild) {
      await rebuildLedger(productId)
    }

    revalidatePath("/inventory/grn")
    return { success: true }
  } catch (error: any) {
    console.error("Hard delete GRN error:", error)
    return { success: false, error: "Failed to permanently delete GRN" }
  }
}
