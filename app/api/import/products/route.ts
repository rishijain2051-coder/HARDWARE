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
    const headers: Record<number, string> = {}

    const HEADER_MAP: Record<string, string> = {
      sku: "SKU",
      description: "Description",
      category: "Category",
      unit: "Unit",
      finish: "Finish",
      size: "Size",
      minstock: "MinStock",
      openingstock: "OpeningStock",
      "default bin": "Default Bin",
      "defaultbin": "Default Bin",
    }

    ws.getRow(1).eachCell((cell, colNumber) => {
      const raw = String(cell.value).trim()
      headers[colNumber] = HEADER_MAP[raw.toLowerCase()] || raw
    })

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const rowData: Record<string, unknown> = {}
      row.eachCell((cell, colNumber) => {
        rowData[headers[colNumber]] = cell.value
      })
      data.push(rowData)
    })

    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: "File is empty" },
        { status: 400 }
      )
    }

    const EMPTY_VALUES = new Set(["", "-", "n/a", "na", "none", "nil", "null", "undefined"])
    function clean(val: unknown): string | null {
      if (val == null) return null
      const s = String(val).trim()
      return EMPTY_VALUES.has(s.toLowerCase()) ? null : s
    }
    function cleanNum(val: unknown): number {
      const s = clean(val)
      if (!s) return 0
      const n = Number(s)
      return isNaN(n) ? 0 : n
    }

    const errors: string[] = []
    let imported = 0
    let updated = 0

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

    const seen = new Set<string>()

    for (let i = 0; i < data.length; i++) {
      const row = data[i]

      try {
        const description = clean(row.Description)
        const catName = clean(row.Category)
        const unitName = clean(row.Unit)

        if (!description) throw new Error("Description is required")
        if (!catName) throw new Error("Category is required")
        if (!unitName) throw new Error("Unit is required")

        const dedupeKey = `${description.toLowerCase()}::${catName.toLowerCase()}`
        if (seen.has(dedupeKey)) throw new Error(`Duplicate in file: "${description}" in category "${catName}"`)
        seen.add(dedupeKey)

        await prisma.$transaction(async (tx) => {
          let category = await tx.category.findFirst({
            where: { name: { equals: catName, mode: "insensitive" } }
          })
          if (!category) {
            category = await tx.category.create({ data: { name: catName, isActive: true } })
          }

          let unit = await tx.unit.findFirst({
            where: { abbreviation: { equals: unitName, mode: "insensitive" } }
          })
          if (!unit) {
            unit = await tx.unit.create({ data: { name: unitName, abbreviation: unitName, isActive: true } })
          }

          let binId: string | null = null
          const binName = clean(row["Default Bin"])
          if (binName) {
            let bin = await tx.bin.findFirst({
              where: { name: { equals: binName, mode: "insensitive" } }
            })
            if (!bin) {
              bin = await tx.bin.create({ data: { name: binName, isActive: true } })
            }
            binId = bin.id
          }

          const openingStock = cleanNum(row.OpeningStock)
          const minStock = cleanNum(row.MinStock)

          const existingProduct = await tx.hardwareProduct.findFirst({
            where: {
              description: { equals: description, mode: "insensitive" },
              categoryId: category.id,
            },
          })

          if (existingProduct) {
            await tx.hardwareProduct.update({
              where: { id: existingProduct.id },
              data: {
                unitId: unit.id,
                finish: clean(row.Finish),
                size: clean(row.Size),
                minStock,
                defaultBinId: binId,
                ...(openingStock > 0 ? { openingStock, currentStock: openingStock } : {}),
              },
            })
            updated++
          } else {
            let sku = clean(row.SKU)
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

            const skuTaken = await tx.hardwareProduct.findUnique({ where: { sku } })
            if (skuTaken) throw new Error(`SKU ${sku} already exists`)

            const p = await tx.hardwareProduct.create({
              data: {
                sku,
                description,
                categoryId: category.id,
                unitId: unit.id,
                finish: clean(row.Finish),
                size: clean(row.Size),
                minStock,
                openingStock,
                currentStock: openingStock,
                defaultBinId: binId,
                isActive: true,
              },
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
                },
              })
            }
            imported++
          }
        })

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`Row ${i + 2}: ${msg}`)
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      updated,
      errors,
    })

  } catch (error: unknown) {
    console.error("Import error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to process import file" },
      { status: 500 }
    )
  }
}
