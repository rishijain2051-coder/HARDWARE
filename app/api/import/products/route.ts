import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import ExcelJS from "exceljs"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    const ws = workbook.worksheets[0]
    
    if (!ws) {
      return NextResponse.json(
        { success: false, error: "File has no worksheets" },
        { status: 400 }
      )
    }

    const data: Record<string, unknown>[] = []
    const headers: Record<number, unknown> = {}

    // Read headers from the first row
    ws.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value
    })

    // Read rows
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // skip header
      const rowData: Record<string, unknown> = {}
      row.eachCell((cell, colNumber) => {
        const headerName = String(headers[colNumber])
        rowData[headerName] = cell.value
      })
      data.push(rowData)
    })

    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: "File is empty" },
        { status: 400 }
      )
    }

    const errors: string[] = []
    let imported = 0

    let systemUser = await prisma.user.findUnique({ where: { email: "system@hardware.local" } })
    if (!systemUser) {
      let adminRole = await prisma.role.findFirst({ where: { name: "ADMIN" } })
      if (!adminRole) {
        adminRole = await prisma.role.create({ data: { name: "ADMIN", description: "Administrator" } })
      }
      systemUser = await prisma.user.create({
        data: {
          email: "system@hardware.local",
          name: "System Migration",
          roleId: adminRole.id,
        }
      })
    }

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      
      try {
        if (!row.Description) throw new Error("Description is required")
        if (!row.Category) throw new Error("Category is required")
        if (!row.Unit) throw new Error("Unit is required")

        await prisma.$transaction(async (tx) => {
          // Find or create Category
          const catName = String(row.Category)
          let category = await tx.category.findFirst({
            where: { name: { equals: catName, mode: "insensitive" } }
          })
          if (!category) {
            category = await tx.category.create({ data: { name: catName, isActive: true } })
          }

          // Find or create Unit
          const unitName = String(row.Unit)
          let unit = await tx.unit.findFirst({
            where: { abbreviation: { equals: unitName, mode: "insensitive" } }
          })
          if (!unit) {
            unit = await tx.unit.create({ data: { name: unitName, abbreviation: unitName, isActive: true } })
          }

          // Find or create Bin
          let binId: string | null = null
          if (row["Default Bin"]) {
            const binName = String(row["Default Bin"])
            let bin = await tx.bin.findFirst({
              where: { name: { equals: binName, mode: "insensitive" } }
            })
            if (!bin) {
              bin = await tx.bin.create({ data: { name: binName, isActive: true } })
            }
            binId = bin.id
          }

          // Generate SKU if missing
          let sku = row.SKU ? String(row.SKU) : null
          if (!sku) {
            const prefix = category.name.substring(0, 3).toUpperCase()
            const lastProduct = await tx.hardwareProduct.findFirst({
              where: { sku: { startsWith: prefix + "-" } },
              orderBy: { sku: "desc" },
            })
            let nextNum = 1
            if (lastProduct) {
              const match = lastProduct.sku.match(/-(\d+)$/)
              if (match) nextNum = parseInt(match[1], 10) + 1
            }
            sku = `${prefix}-${String(nextNum).padStart(4, "0")}`
          }

          const existing = await tx.hardwareProduct.findUnique({ where: { sku: sku } })
          if (existing) throw new Error(`SKU ${sku} already exists`)

          const openingStock = row.OpeningStock ? Number(row.OpeningStock) : 0
          const minStock = row.MinStock ? Number(row.MinStock) : 0

          const p = await tx.hardwareProduct.create({
            data: {
              sku: sku,
              description: String(row.Description),
              categoryId: category.id,
              unitId: unit.id,
              finish: row.Finish ? String(row.Finish) : null,
              size: row.Size ? String(row.Size) : null,
              minStock,
              openingStock,
              currentStock: openingStock,
              defaultBinId: binId,
              isActive: true,
            }
          })

          if (openingStock > 0 && systemUser) {
            await tx.storeLog.create({
              data: {
                transactionType: "OPENING",
                referenceNumber: `OPENING-${sku}`,
                productId: p.id,
                quantity: openingStock,
                balanceAfter: openingStock,
                createdById: systemUser.id,
              }
            })
          }
        })

        imported++

      } catch (err: unknown) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      errors
    })

  } catch (error: unknown) {
    console.error("Import error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to process import file" },
      { status: 500 }
    )
  }
}
