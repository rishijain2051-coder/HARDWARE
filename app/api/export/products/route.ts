import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

export async function GET() {
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

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, "Products")

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="products.xlsx"`,
    },
  })
}
