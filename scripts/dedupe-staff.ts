/**
 * Merges duplicate employee records.
 *
 *   npx tsx scripts/dedupe-staff.ts            # report only, changes nothing
 *   npx tsx scripts/dedupe-staff.ts --apply    # perform the merge
 *
 * Staff.name had no unique constraint (unlike Category, Unit and Bin), and the
 * master dialog did not disable its Save button, so clicking again when nothing
 * appeared to happen inserted a second row. The duplicates in the wild were
 * created two to three seconds apart, which is exactly that.
 *
 * Rows are grouped by a normalised name — trimmed, internal whitespace
 * collapsed, lowercased — because that is the same key the unique index now
 * enforces. One row per group survives; the rest are merged into it and deleted.
 *
 * The survivor is the row with the most transactions behind it, and the earliest
 * of those if several tie. That keeps the record that carries history, which is
 * the one whose id already appears in the ledger.
 */

import "dotenv/config"
import { prisma } from "../lib/prisma"
import { blankToNull, normaliseStaffName, staffNameKey } from "../lib/staff"

const APPLY = process.argv.includes("--apply")

async function main() {
  console.log(
    `\n👥 Employee de-duplication — ${APPLY ? "APPLYING CHANGES" : "dry run, nothing will be written"}\n`
  )

  const staff = await prisma.staff.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { misHeaders: true, storeLogs: true } } },
  })

  const groups = new Map<string, typeof staff>()
  for (const row of staff) {
    const key = staffNameKey(row.name)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  const duplicated = [...groups.values()].filter((rows) => rows.length > 1)

  console.log(`  ${staff.length} rows, ${groups.size} distinct employees`)
  console.log(`  ${duplicated.length} name(s) duplicated`)
  console.log(
    `  ${duplicated.reduce((n, rows) => n + rows.length - 1, 0)} row(s) to merge away\n`
  )

  let merged = 0
  let repointedMis = 0
  let repointedLogs = 0

  for (const rows of duplicated) {
    // Most history wins; earliest created breaks a tie.
    const ranked = [...rows].sort((a, b) => {
      const aRefs = a._count.misHeaders + a._count.storeLogs
      const bRefs = b._count.misHeaders + b._count.storeLogs
      if (aRefs !== bRefs) return bRefs - aRefs
      return a.createdAt.getTime() - b.createdAt.getTime()
    })
    const [survivor, ...losers] = ranked

    // Anything the survivor is missing but a loser recorded is worth keeping.
    const filled: Record<string, string> = {}
    for (const field of ["department", "employeeCode", "phone"] as const) {
      if (blankToNull(survivor[field])) continue
      for (const loser of losers) {
        const value = blankToNull(loser[field])
        if (value) {
          filled[field] = value
          break
        }
      }
    }

    const survivorRefs = survivor._count.misHeaders + survivor._count.storeLogs
    console.log(`── ${JSON.stringify(survivor.name)}`)
    console.log(
      `     keep   ${survivor.id}  (${survivorRefs} transaction${survivorRefs === 1 ? "" : "s"}, created ${survivor.createdAt.toISOString().slice(0, 19)})`
    )
    if (Object.keys(filled).length > 0) {
      console.log(`     adopt  ${JSON.stringify(filled)} from a duplicate`)
    }
    for (const loser of losers) {
      const refs = loser._count.misHeaders + loser._count.storeLogs
      console.log(
        `     merge  ${loser.id}  (${refs} transaction${refs === 1 ? "" : "s"} to repoint)`
      )
    }

    if (!APPLY) continue

    const loserIds = losers.map((l) => l.id)
    await prisma.$transaction(async (tx) => {
      // History has to move before the rows it points at disappear, or the FK
      // rejects the delete.
      const mis = await tx.misHeader.updateMany({
        where: { staffId: { in: loserIds } },
        data: { staffId: survivor.id },
      })
      const logs = await tx.storeLog.updateMany({
        where: { staffId: { in: loserIds } },
        data: { staffId: survivor.id },
      })
      repointedMis += mis.count
      repointedLogs += logs.count

      await tx.staff.update({
        where: { id: survivor.id },
        data: {
          name: normaliseStaffName(survivor.name),
          nameKey: staffNameKey(survivor.name),
          department: blankToNull(filled.department ?? survivor.department),
          employeeCode: blankToNull(filled.employeeCode ?? survivor.employeeCode),
          phone: blankToNull(filled.phone ?? survivor.phone),
          // If any copy was still in use, the surviving record should be too.
          isActive: rows.some((r) => r.isActive),
        },
      })

      await tx.staff.deleteMany({ where: { id: { in: loserIds } } })
    })
    merged += losers.length
  }

  // Tidy the rest too: trailing spaces and empty strings are what let a
  // "duplicate" hide from a naive comparison in the first place.
  const untouched = [...groups.values()].filter((rows) => rows.length === 1).map((r) => r[0])
  let tidied = 0
  for (const row of untouched) {
    const name = normaliseStaffName(row.name)
    const department = blankToNull(row.department)
    const employeeCode = blankToNull(row.employeeCode)
    const phone = blankToNull(row.phone)

    if (
      name === row.name &&
      department === row.department &&
      employeeCode === row.employeeCode &&
      phone === row.phone &&
      staffNameKey(row.name) === row.nameKey
    ) {
      continue
    }
    tidied++
    if (!APPLY) continue
    await prisma.staff.update({
      where: { id: row.id },
      data: { name, nameKey: staffNameKey(name), department, employeeCode, phone },
    })
  }

  console.log(`\n${"=".repeat(60)}`)
  if (APPLY) {
    console.log(`  merged ${merged} duplicate row(s)`)
    console.log(`  repointed ${repointedMis} सामान दिया header(s), ${repointedLogs} ledger entry(ies)`)
    console.log(`  tidied whitespace/blank fields on ${tidied} other row(s)`)
  } else {
    console.log(`  would merge ${duplicated.reduce((n, r) => n + r.length - 1, 0)} row(s)`)
    console.log(`  would tidy ${tidied} other row(s)`)
    console.log(`\n  re-run with --apply to perform the merge`)
  }
  console.log(`${"=".repeat(60)}\n`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
