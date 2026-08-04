"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { staffSchema, StaffFormValues } from "./schema"
import { authorize } from "@/lib/dal"
import { blankToNull, normaliseStaffName, staffNameKey } from "@/lib/staff"
import { TXN_LABELS } from "@/lib/labels"

/**
 * The same employee could previously be added over and over: `Staff.name` had no
 * unique constraint (unlike Category, Unit and Bin) and this action did no
 * checking, so clicking Save twice inserted twice.
 *
 * There are now two lines of defence. The check below produces a message worth
 * reading, and `Staff.nameKey` carries a unique index that also holds when two
 * submits arrive close enough together to both pass the check.
 */
export async function saveStaff(data: StaffFormValues) {
  const result = staffSchema.safeParse(data)

  if (!result.success) {
    return { success: false, error: "Invalid data" }
  }

  const { id, isActive } = result.data

  // Creating and updating are separately grantable permissions.
  const gate = await authorize("STAFF_MASTER", id ? "EDIT" : "CREATE")
  if (!gate.success) return gate

  const name = normaliseStaffName(result.data.name)
  const nameKey = staffNameKey(name)
  if (!name) return { success: false, error: "Name is required" }

  const fields = {
    name,
    nameKey,
    department: blankToNull(result.data.department),
    employeeCode: blankToNull(result.data.employeeCode),
    phone: blankToNull(result.data.phone),
    isActive,
  }

  try {
    // Renaming an employee onto an existing one is the same conflict as creating
    // a duplicate, so both paths check — the edit case just excludes itself.
    const clash = await prisma.staff.findFirst({
      where: { nameKey, ...(id ? { id: { not: id } } : {}) },
      select: { name: true, isActive: true },
    })
    if (clash) {
      return { success: false, error: duplicateMessage(clash) }
    }

    if (id) {
      await prisma.staff.update({ where: { id }, data: fields })
    } else {
      await prisma.staff.create({ data: fields })
    }

    revalidatePath("/masters/staff")
    return { success: true }
  } catch (error: unknown) {
    // The unique index rejecting the write means a concurrent submit got there
    // first — two clicks in quick succession, or two terminals at once. Report it
    // as the duplicate it is rather than as a failure.
    if (isUniqueViolation(error)) {
      const existing = await prisma.staff.findUnique({
        where: { nameKey },
        select: { name: true, isActive: true },
      })
      return {
        success: false,
        error: existing ? duplicateMessage(existing) : `"${name}" is already on the list.`,
      }
    }
    console.error("Save staff error:", error)
    return { success: false, error: "Failed to save staff" }
  }
}

function duplicateMessage(existing: { name: string; isActive: boolean }): string {
  return existing.isActive
    ? `"${existing.name}" is already on the employee list.`
    : `"${existing.name}" already exists but is deactivated. Reactivate that record instead of adding a second one.`
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  )
}

/**
 * Deactivates an employee, or removes the record outright when `hardDelete` is
 * set.
 *
 * Deactivating is the everyday operation and needs STAFF_MASTER:DELETE.
 * Destroying the record is irreversible and stays with super admins, matching
 * `deleteProduct`.
 */
export async function deleteStaff(id: string, hardDelete: boolean = false) {
  const gate = await authorize("STAFF_MASTER", "DELETE")
  if (!gate.success) return gate

  try {
    if (!hardDelete) {
      await prisma.staff.update({ where: { id }, data: { isActive: false } })
      revalidatePath("/masters/staff")
      return { success: true }
    }

    if (!gate.access.isSuperAdmin) {
      return { success: false, error: "Only administrators can permanently delete records." }
    }

    const staff = await prisma.staff.findUnique({
      where: { id },
      select: { name: true },
    })
    if (!staff) return { success: false, error: "Employee not found." }

    /*
     * Both foreign keys pointing at Staff are `ON DELETE SET NULL`, so Postgres
     * would accept this delete and quietly blank the attribution on every
     * सामान दिया and every ledger entry the employee appears in. The history
     * would then read "issued to —" with nothing to say who it had been.
     *
     * So refuse, the way `deleteProduct` refuses for a product with
     * transactions. A record marked inactive is a far better outcome than a
     * ledger that has forgotten who took the stock.
     */
    const [outwardCount, ledgerCount] = await Promise.all([
      prisma.misHeader.count({ where: { staffId: id } }),
      prisma.storeLog.count({ where: { staffId: id } }),
    ])

    if (outwardCount + ledgerCount > 0) {
      const parts = [
        outwardCount > 0 && `${outwardCount} ${TXN_LABELS.outward}`,
        ledgerCount > 0 && `${ledgerCount} store log ${ledgerCount === 1 ? "entry" : "entries"}`,
      ].filter(Boolean)
      return {
        success: false,
        error:
          `"${staff.name}" appears in ${parts.join(" and ")}, so deleting the record would ` +
          `erase who those belong to. Deactivate the employee instead — they will stop ` +
          `appearing in dropdowns but the history stays intact.`,
      }
    }

    await prisma.staff.delete({ where: { id } })
    revalidatePath("/masters/staff")
    return { success: true }
  } catch (error: unknown) {
    console.error("Delete staff error:", error)
    return {
      success: false,
      error: hardDelete
        ? "Failed to permanently delete the employee."
        : "Failed to deactivate the employee.",
    }
  }
}
