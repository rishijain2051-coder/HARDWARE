"use server"

import { prisma } from "@/lib/prisma"

export async function getLowStockReport() {
  return await prisma.hardwareProduct.findMany({
    where: {
      isActive: true,
      minStock: { gt: 0 },
    },
    include: {
      category: { select: { name: true } },
      unit: { select: { abbreviation: true } },
    },
    orderBy: { currentStock: "asc" },
  })
}

export async function getStockSummaryReport() {
  return await prisma.hardwareProduct.findMany({
    where: { isActive: true },
    include: {
      category: { select: { name: true } },
      unit: { select: { abbreviation: true } },
      defaultBin: { select: { name: true } },
    },
    orderBy: [{ category: { name: "asc" } }, { sku: "asc" }],
  })
}

export async function getPurchaseHistoryReport({
  productId,
  supplierId,
  dateFrom,
  dateTo,
}: {
  productId?: string
  supplierId?: string
  dateFrom?: string
  dateTo?: string
} = {}) {
  const where: any = {}
  if (productId) where.productId = productId
  if (supplierId) where.supplierId = supplierId
  if (dateFrom || dateTo) {
    where.date = {}
    if (dateFrom) where.date.gte = new Date(dateFrom)
    if (dateTo) where.date.lte = new Date(dateTo + "T23:59:59")
  }

  return await prisma.purchaseHistory.findMany({
    where,
    include: {
      product: { select: { sku: true, description: true } },
      supplier: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: 500,
  })
}

export async function getSupplierWiseReport() {
  const [suppliers, purchaseData] = await Promise.all([
    prisma.supplier.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        _count: { select: { grnHeaders: true, purchaseHistory: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.purchaseHistory.findMany({
      where: { supplier: { isActive: true } },
      select: { supplierId: true, rate: true, quantity: true },
    }),
  ])

  const totalValueMap = new Map<string, number>()
  for (const ph of purchaseData) {
    totalValueMap.set(ph.supplierId, (totalValueMap.get(ph.supplierId) || 0) + ph.rate * ph.quantity)
  }

  return suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    totalGrns: s._count.grnHeaders,
    totalPurchases: s._count.purchaseHistory,
    totalValue: totalValueMap.get(s.id) || 0,
  }))
}

export async function getCategoryStockReport() {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    include: {
      products: {
        where: { isActive: true },
        select: { currentStock: true, minStock: true },
      },
    },
    orderBy: { name: "asc" },
  })

  return categories.map((c: any) => ({
    id: c.id,
    name: c.name,
    totalProducts: c.products.length,
    totalStock: c.products.reduce((sum: number, p: any) => sum + p.currentStock, 0),
    lowStockCount: c.products.filter((p: any) => p.minStock > 0 && p.currentStock <= p.minStock).length,
  }))
}
