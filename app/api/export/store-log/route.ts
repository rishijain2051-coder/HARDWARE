import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import ExcelJS from "exceljs"
import { format } from "date-fns"

export async function GET() {
  const logs = await prisma.storeLog.findMany({
    include: {
      product: { select: { sku: true, description: true } },
      supplier: { select: { name: true } },
      staff: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: 5000,
  })

  const data = logs.map((l) => ({
    Date: format(new Date(l.date), "dd/MM/yyyy HH:mm"),
    Type: l.transactionType,
    "Reference #": l.referenceNumber,
    SKU: l.product?.sku || "",
    Product: l.product?.description || "",
    Quantity: l.quantity,
    "Balance After": l.balanceAfter,
    Supplier: l.supplier?.name || "",
    Staff: l.staff?.name || "",
  }))

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet("Store Log")

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
      "Content-Disposition": `attachment; filename="store-log.xlsx"`,
    },
  })
}
