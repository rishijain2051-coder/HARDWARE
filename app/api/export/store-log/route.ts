import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"
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

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, "Store Log")

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="store-log.xlsx"`,
    },
  })
}
