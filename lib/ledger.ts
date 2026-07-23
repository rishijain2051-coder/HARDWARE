import { prisma } from "./prisma"

/**
 * Rebuilds the StoreLog balances and the Product currentStock for a given productId.
 * This should be called after any hard deletion of historical transactions (GRN, MIS, or StoreLog)
 * to ensure that the running balance is mathematically correct based on the remaining ledger entries.
 */
export async function rebuildLedger(productId: string) {
  // Fetch all StoreLog entries for the product, sorted by chronological date, and then by creation time
  const logs = await prisma.storeLog.findMany({
    where: { productId },
    orderBy: [
      { date: "asc" },
      { createdAt: "asc" },
    ],
  })

  let runningBalance = 0

  // Sequentially recalculate the balance for each entry
  for (const log of logs) {
    runningBalance += log.quantity

    // Only update if the balanceAfter is incorrect
    if (log.balanceAfter !== runningBalance) {
      await prisma.storeLog.update({
        where: { id: log.id },
        data: { balanceAfter: runningBalance },
      })
    }
  }

  // Finally, update the Product's current stock to match the final balance
  await prisma.hardwareProduct.update({
    where: { id: productId },
    data: { currentStock: runningBalance },
  })

  return runningBalance
}
