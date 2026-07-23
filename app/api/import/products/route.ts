import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

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

    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(ws)

    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: "File is empty" },
        { status: 400 }
      )
    }

    const errors: string[] = []
    let imported = 0

    // Fetch existing lookup data to map names to IDs
    const [categories, units, bins] = await Promise.all([
      prisma.category.findMany(),
      prisma.unit.findMany(),
      prisma.bin.findMany(),
    ])

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
      const row: any = data[i]
      
      try {
        if (!row.Description) throw new Error("Description is required")
        if (!row.Category) throw new Error("Category is required")
        if (!row.Unit) throw new Error("Unit is required")

        // Find relations
        let category = categories.find(c => c.name.toLowerCase() === String(row.Category).toLowerCase())
        if (!category) {
          category = await prisma.category.create({ data: { name: String(row.Category), isActive: true } })
          categories.push(category)
        }

        let unit = units.find(u => u.abbreviation.toLowerCase() === String(row.Unit).toLowerCase())
        if (!unit) {
          unit = await prisma.unit.create({ data: { name: String(row.Unit), abbreviation: String(row.Unit), isActive: true } })
          units.push(unit)
        }

        let binId = null
        if (row["Default Bin"]) {
          let bin = bins.find(b => b.name.toLowerCase() === String(row["Default Bin"]).toLowerCase())
          if (!bin) {
            bin = await prisma.bin.create({ data: { name: String(row["Default Bin"]), isActive: true } })
            bins.push(bin)
          }
          binId = bin.id
        }

        // Generate SKU if missing
        let sku = row.SKU ? String(row.SKU) : null
        if (!sku) {
          const prefix = category.name.substring(0, 3).toUpperCase()
          const lastProduct = await prisma.hardwareProduct.findFirst({
            where: { sku: { startsWith: prefix + "-" } },
            orderBy: { sku: "desc" },
          })
          let nextNum = 1
          if (lastProduct) {
            const match = lastProduct.sku.match(/-(\d+)$/)
            if (match) nextNum = parseInt(match[1]) + 1
          }
          sku = `${prefix}-${String(nextNum).padStart(4, "0")}`
        }

        const openingStock = row.OpeningStock ? Number(row.OpeningStock) : 0
        const minStock = row.MinStock ? Number(row.MinStock) : 0

        // Create product
        const product = await prisma.$transaction(async (tx) => {
          const existing = await tx.hardwareProduct.findUnique({ where: { sku: sku as string } })
          if (existing) throw new Error(`SKU ${sku} already exists`)

          const p = await tx.hardwareProduct.create({
            data: {
              sku: sku as string,
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

          return p
        })

        imported++

      } catch (err: any) {
        errors.push(err.message)
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      errors
    })

  } catch (error: any) {
    console.error("Import error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to process import file" },
      { status: 500 }
    )
  }
}
