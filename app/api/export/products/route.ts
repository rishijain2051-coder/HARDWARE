import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import ExcelJS from "exceljs"
import { guardRoute } from "@/lib/dal"

export async function GET() {
  // Downloading the product master needs rights on the bulk-transfer screen
  // *and* on the underlying data. This route was previously wide open.
  const denied =
    (await guardRoute("DATA_TRANSFER", "EXPORT")) ??
    (await guardRoute("PRODUCT_MASTER", "EXPORT"))
  if (denied) return denied

  const products = await prisma.hardwareProduct.findMany({
    include: {
      category: { select: { name: true } },
      unit: { select: { name: true, abbreviation: true } },
      defaultBin: { select: { name: true } },
    },
    orderBy: { sku: "asc" },
  })

  const data = products.map((p) => ({
    SKU: p.sku,
    Description: p.description,
    Category: p.category?.name || "",
    Unit: p.unit?.abbreviation || "",
    Finish: p.finish || "",
    Size: p.size || "",
    "Current Stock": p.currentStock,
    "Min Stock": p.minStock,
    "Opening Stock": p.openingStock,
    "Default Bin": p.defaultBin?.name || "",
    "Last Purchase Rate": p.lastPurchaseRate || "",
    Active: p.isActive ? "Yes" : "No",
  }))

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet("Products")

  if (data.length > 0) {
    const headers = Object.keys(data[0])
    worksheet.columns = headers.map((h) => ({ header: h, key: h }))
    data.forEach((row) => worksheet.addRow(row))
  } else {
    worksheet.addRow(["No data available"])
  }

  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="products.xlsx"`,
    },
  })
}
