"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { hasPermission } from "@/lib/permissions"

async function generateMisNumber(): Promise<string> {
  const now = new Date()
  const prefix = `MIS-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`

  const last = await prisma.misHeader.findFirst({
    where: { misNumber: { startsWith: prefix } },
    orderBy: { misNumber: "desc" },
  })

  let seq = 1
  if (last) {
    const match = last.misNumber.match(/-(\d+)$/)
    if (match) seq = parseInt(match[1]) + 1
  }

  return `${prefix}-${String(seq).padStart(4, "0")}`
}

export async function getMisList() {
  return await prisma.misHeader.findMany({
    where: { isDeleted: false },
    include: {
      staff: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { date: "desc" },
  })
}

export async function getMisById(id: string) {
  return await prisma.misHeader.findUnique({
    where: { id },
    include: {
      staff: true,
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

interface MisItemInput {
  productId: string
  quantity: number
  binId?: string
}

export async function saveMis(data: {
  recipientType: string
  staffId?: string
  purpose?: string
  items: MisItemInput[]
  createdById: string
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { success: false, error: "Unauthorized" }
  if (!(await hasPermission(session.user.id, "OUTWARD_RECORD", "EDIT"))) return { success: false, error: "Unauthorized" }
  const { recipientType, staffId, purpose, items, createdById } = data

  if (!recipientType) return { success: false, error: "Recipient type is required" }
  if (!items || items.length === 0) return { success: false, error: "At least one item is required" }

  try {
    const misNumber = await generateMisNumber()

    const result = await prisma.$transaction(async (tx) => {
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

      // 1. Create MIS header
      const mis = await tx.misHeader.create({
        data: {
          misNumber,
          recipientType: recipientType as any,
          staffId: staffId || null,
          purpose: purpose || null,
          createdById: finalUserId,
        },
      })

      // 2. Create MIS items and update stock
      for (const item of items) {
        // Check sufficient stock
        const product = await tx.hardwareProduct.findUnique({
          where: { id: item.productId },
        })
        if (!product) throw new Error(`Product not found`)
        if (product.currentStock < item.quantity) {
          throw new Error(
            `Insufficient stock for ${product.sku}. Available: ${product.currentStock}, Required: ${item.quantity}`
          )
        }

        await tx.misItem.create({
          data: {
            misHeaderId: mis.id,
            productId: item.productId,
            quantity: item.quantity,
            binId: item.binId || null,
          },
        })

        // Deduct stock
        const updated = await tx.hardwareProduct.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: item.quantity } },
        })

        // Store log
        await tx.storeLog.create({
          data: {
            transactionType: "MIS",
            referenceNumber: misNumber,
            productId: item.productId,
            quantity: -item.quantity,
            balanceAfter: updated.currentStock,
            staffId: staffId || null,
            createdById: finalUserId,
          },
        })

        // Bin stock deduction
        if (item.binId) {
          await tx.binStock.update({
            where: {
              productId_binId: {
                productId: item.productId,
                binId: item.binId,
              },
            },
            data: { quantity: { decrement: item.quantity } },
          })
        }
      }

      return mis
    })

    revalidatePath("/inventory/mis")
    return { success: true, misNumber: result.misNumber }
  } catch (error: any) {
    console.error("MIS save error:", error)
    return { success: false, error: error.message || "Failed to save MIS" }
  }
}

export async function hardDeleteMis(id: string) {
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
    const mis = await prisma.misHeader.findUnique({
      where: { id },
      include: { items: true }
    })
    if (!mis) return { success: false, error: "MIS not found" }

    const productIdsToRebuild = new Set(mis.items.map(item => item.productId))

    await prisma.$transaction(async (tx) => {
      // 1. Delete associated Store Log entries
      await tx.storeLog.deleteMany({
        where: { referenceNumber: mis.misNumber, transactionType: "MIS" }
      })

      // 2. Adjust Bin stocks back (increment because MIS originally decrements them)
      for (const item of mis.items) {
        if (item.binId) {
          await tx.binStock.update({
            where: {
              productId_binId: { productId: item.productId, binId: item.binId }
            },
            data: { quantity: { increment: item.quantity } }
          })
        }
      }

      // 3. The MisHeader deletion will cascade and delete MisItems.
      await tx.misHeader.delete({ where: { id } })
    })

    // Rebuild ledgers
    const { rebuildLedger } = await import("@/lib/ledger")
    for (const productId of productIdsToRebuild) {
      await rebuildLedger(productId)
    }

    revalidatePath("/inventory/mis")
    return { success: true }
  } catch (error: any) {
    console.error("Hard delete MIS error:", error)
    return { success: false, error: "Failed to permanently delete MIS" }
  }
}
