"use server"

import { prisma } from "@/lib/prisma"
import { authorize } from "@/lib/dal"

export async function hardDeleteStoreLog(id: string) {
  const gate = await authorize("STORE_LOG", "DELETE")
  if (!gate.success) return gate

  try {
    const log = await prisma.storeLog.findUnique({ where: { id } })
    if (!log) return { success: false, error: "Store log not found" }

    // If it belongs to a GRN, delete the entire GRN instead
    if (log.transactionType === "GRN") {
      const grn = await prisma.grnHeader.findUnique({ where: { grnNumber: log.referenceNumber } })
      if (grn) {
        const { hardDeleteGrn } = await import("@/app/(dashboard)/inventory/grn/actions")
        return await hardDeleteGrn(grn.id)
      }
    } 
    // If it belongs to an MIS, delete the entire MIS instead
    else if (log.transactionType === "MIS") {
      const mis = await prisma.misHeader.findUnique({ where: { misNumber: log.referenceNumber } })
      if (mis) {
        const { hardDeleteMis } = await import("@/app/(dashboard)/inventory/mis/actions")
        return await hardDeleteMis(mis.id)
      }
    }

    // Otherwise (OPENING or ADJUSTMENT), just hard delete the store log entry
    await prisma.storeLog.delete({ where: { id } })

    // Rebuild the ledger for that product
    const { rebuildLedger } = await import("@/lib/ledger")
    await rebuildLedger(log.productId)

    const { revalidatePath } = await import("next/cache")
    revalidatePath("/inventory/store-log")
    
    return { success: true }
  } catch (error) {
    console.error("Failed to delete store log", error)
    return { success: false, error: "Failed to permanently delete store log" }
  }
}
