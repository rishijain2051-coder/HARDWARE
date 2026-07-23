"use server"

import { prisma } from "@/lib/prisma"
import { startOfDay, endOfDay } from "date-fns"

export async function getConsumptionReport(filters: {
  startDate: Date
  endDate: Date
  staffId?: string
}) {
  const { startDate, endDate, staffId } = filters

  const whereCondition: any = {
    isDeleted: false,
    date: {
      gte: startOfDay(startDate),
      lte: endOfDay(endDate),
    },
  }

  // If a specific staff member is selected, filter by them.
  // Otherwise, only include records that have a staffId (actual consumption).
  if (staffId && staffId !== "ALL") {
    whereCondition.staffId = staffId
  } else {
    whereCondition.staffId = { not: null }
  }

  // Fetch all MisItems that match the criteria
  const misItems = await prisma.misItem.findMany({
    where: {
      misHeader: whereCondition,
    },
    include: {
      product: {
        include: {
          category: true,
          unit: true,
        },
      },
      misHeader: {
        include: {
          staff: true,
        },
      },
    },
  })

  // Aggregate by Staff -> Product
  // Key format: `${staffId}_${productId}`
  const aggregation = new Map<string, any>()

  for (const item of misItems) {
    const sId = item.misHeader.staffId!
    const pId = item.productId
    const key = `${sId}_${pId}`

    if (!aggregation.has(key)) {
      aggregation.set(key, {
        staffId: sId,
        staffName: item.misHeader.staff?.name || "Unknown Staff",
        staffDepartment: item.misHeader.staff?.department || "N/A",
        productId: pId,
        productSku: item.product.sku,
        productDesc: item.product.description,
        category: item.product.category?.name || "—",
        unit: item.product.unit?.name || "—",
        totalConsumed: 0,
      })
    }

    const current = aggregation.get(key)
    current.totalConsumed += item.quantity
  }

  return Array.from(aggregation.values()).sort((a, b) => {
    if (a.staffName !== b.staffName) return a.staffName.localeCompare(b.staffName)
    return a.productSku.localeCompare(b.productSku)
  })
}

export async function getStaffList() {
  return await prisma.staff.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, department: true },
  })
}
