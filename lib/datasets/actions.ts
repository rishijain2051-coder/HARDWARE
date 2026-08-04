"use server"

import { prisma } from "@/lib/prisma"
import { getAccess } from "@/lib/dal"
import type { ModuleKey, PermissionAction, PermissionSet } from "@/lib/permissions"
import {
  isDatasetKind,
  type DashboardStats,
  type DatasetKind,
  type DatasetPayloads,
  type DatasetResult,
} from "./types"

/**
 * Server side of the browser data cache.
 *
 * Two entry points, both batched so a screen needs at most one round trip:
 *
 *   fetchDatasetRevisions(kinds) — cheap "has anything changed?" probe
 *   fetchDatasets(kinds)         — the data itself
 *
 * Everything a client can reach is a public HTTP endpoint, so `kinds` is
 * validated against the allowlist in ./types and every dataset carries its own
 * permission gate. A caller asking for one they may not see gets nothing back
 * for it — not an empty shell, which the client would cache as though it were an
 * answer.
 */

/**
 * Which permissions entitle a user to read each dataset.
 *
 * The slim reference lists are readable by anyone holding a permission for a
 * screen that cannot be filled in without them — you cannot book a सामान आया
 * without picking a supplier, so INWARD_RECORD:CREATE has to imply reading
 * supplier *names* even for a clerk with no supplier master access.
 *
 * The full row sets are a different matter and are gated strictly on the
 * master's own VIEW, because they carry phone numbers, addresses and GST
 * numbers that a clerk booking stock has no business reading.
 */
const DATASET_GATES: Record<
  DatasetKind,
  readonly (readonly [ModuleKey, PermissionAction])[]
> = {
  // ---- reference lists ----
  categories: [
    ["CATEGORY_MASTER", "VIEW"],
    ["PRODUCT_MASTER", "VIEW"],
    ["PRODUCT_MASTER", "CREATE"],
    ["INWARD_RECORD", "CREATE"],
    ["OUTWARD_RECORD", "CREATE"],
  ],
  units: [
    ["UNIT_MASTER", "VIEW"],
    ["PRODUCT_MASTER", "VIEW"],
    ["PRODUCT_MASTER", "CREATE"],
    ["INWARD_RECORD", "CREATE"],
    ["OUTWARD_RECORD", "CREATE"],
  ],
  bins: [
    ["BIN_MASTER", "VIEW"],
    ["PRODUCT_MASTER", "VIEW"],
    ["PRODUCT_MASTER", "CREATE"],
    ["INWARD_RECORD", "CREATE"],
    ["OUTWARD_RECORD", "CREATE"],
  ],
  suppliers: [
    ["SUPPLIER_MASTER", "VIEW"],
    ["INWARD_RECORD", "VIEW"],
    ["INWARD_RECORD", "CREATE"],
  ],
  staff: [
    ["STAFF_MASTER", "VIEW"],
    ["OUTWARD_RECORD", "VIEW"],
    ["OUTWARD_RECORD", "CREATE"],
  ],
  attributes: [
    ["ATTRIBUTE_MASTER", "VIEW"],
    ["PRODUCT_MASTER", "VIEW"],
    ["PRODUCT_MASTER", "CREATE"],
  ],
  products: [
    ["PRODUCT_MASTER", "VIEW"],
    ["INWARD_RECORD", "CREATE"],
    ["OUTWARD_RECORD", "CREATE"],
  ],

  // ---- master tables: strictly that master's own VIEW ----
  categoryRows: [["CATEGORY_MASTER", "VIEW"]],
  unitRows: [["UNIT_MASTER", "VIEW"]],
  binRows: [["BIN_MASTER", "VIEW"]],
  supplierRows: [["SUPPLIER_MASTER", "VIEW"]],
  staffRows: [["STAFF_MASTER", "VIEW"]],
  attributeRows: [["ATTRIBUTE_MASTER", "VIEW"]],
  productRows: [["PRODUCT_MASTER", "VIEW"]],

  // ---- screens ----
  grnList: [["INWARD_RECORD", "VIEW"]],
  misList: [["OUTWARD_RECORD", "VIEW"]],
  storeLog: [["STORE_LOG", "VIEW"]],
  dashboard: [["DASHBOARD", "VIEW"]],
}

function mayRead(access: PermissionSet, kind: DatasetKind): boolean {
  return DATASET_GATES[kind].some(([module, action]) => access.can(module, action))
}

/**
 * Narrows an untrusted argument to known kinds, de-duplicated.
 *
 * De-duplication matters: without it a caller could pass the same kind a
 * thousand times and turn one action call into a thousand database round trips.
 */
function sanitiseKinds(input: unknown): DatasetKind[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<DatasetKind>()
  for (const value of input) {
    if (isDatasetKind(value)) seen.add(value)
  }
  return [...seen]
}

/** How many rows of history a list screen carries. */
const LIST_LIMIT = 500

// ============================================================
// Revisions
// ============================================================

/**
 * A dataset's revision has to change whenever anything it *reads* changes, not
 * just its headline table.
 *
 * The product table shows a unit abbreviation next to each SKU, so renaming a
 * unit changes what /masters/products displays without touching a single product
 * row — and a revision derived from `hardwareProduct` alone would happily serve
 * the old name. So each dataset declares the tables behind it, and its revision
 * is the composite.
 *
 * `user` is in here because the entry lists and the ledger show who booked each
 * record.
 */
type SourceTable =
  | "category"
  | "unit"
  | "bin"
  | "supplier"
  | "staff"
  | "attribute"
  | "product"
  | "grn"
  | "mis"
  | "storeLog"
  | "user"

const DATASET_SOURCES: Record<DatasetKind, readonly SourceTable[]> = {
  categories: ["category"],
  units: ["unit"],
  bins: ["bin"],
  suppliers: ["supplier"],
  staff: ["staff"],
  attributes: ["attribute", "category"],
  // Shows the unit abbreviation beside the stock figure.
  products: ["product", "unit"],

  categoryRows: ["category"],
  unitRows: ["unit"],
  binRows: ["bin"],
  supplierRows: ["supplier"],
  staffRows: ["staff"],
  attributeRows: ["attribute"],
  // Joins category, unit, default bin and attribute names into every row.
  productRows: ["product", "category", "unit", "bin", "attribute"],

  grnList: ["grn", "supplier", "user"],
  misList: ["mis", "staff", "user"],
  storeLog: ["storeLog", "product", "supplier", "staff", "user"],
  dashboard: ["product", "grn", "mis", "category"],
}

/**
 * Row count plus the newest `updatedAt`, which is enough to detect any edit,
 * insert, deactivation or delete without reading the rows themselves.
 *
 * Stock movements count as edits: booking a सामान आया writes `currentStock` on
 * the product, so the products revision moves and cached stock figures in the
 * combobox refresh on their own.
 */
function revisionOf(count: number, newest: Date | null): string {
  return `${count}.${newest ? newest.getTime() : 0}`
}

async function sourceRevision(table: SourceTable): Promise<string> {
  switch (table) {
    case "category": {
      const a = await prisma.category.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
    case "unit": {
      const a = await prisma.unit.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
    case "bin": {
      const a = await prisma.bin.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
    case "supplier": {
      const a = await prisma.supplier.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
    case "staff": {
      const a = await prisma.staff.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
    case "attribute": {
      // The category links live in their own table with no timestamp of their
      // own, so attaching an attribute to a category would otherwise leave the
      // revision unchanged. Their row count covers that.
      const [a, links] = await Promise.all([
        prisma.attribute.aggregate({
          _count: { _all: true },
          _max: { updatedAt: true },
        }),
        prisma.categoryAttribute.count(),
      ])
      return `${revisionOf(a._count._all, a._max.updatedAt)}.${links}`
    }
    case "product": {
      // Aliases and attribute values live in their own tables, but every path
      // that writes them (`saveProduct`, the spreadsheet import) updates the
      // product row in the same transaction, so its updatedAt moves with them.
      const a = await prisma.hardwareProduct.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
    case "grn": {
      const a = await prisma.grnHeader.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
    case "mis": {
      const a = await prisma.misHeader.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
    case "storeLog": {
      // StoreLog has no updatedAt: rows are appended, never edited. Count plus
      // the newest row's date and id pins the state exactly, including the case
      // where a deletion and an insert leave the count unchanged.
      const [count, newest] = await Promise.all([
        prisma.storeLog.count(),
        prisma.storeLog.findFirst({
          orderBy: { date: "desc" },
          select: { id: true, date: true },
        }),
      ])
      return `${count}.${newest ? `${newest.date.getTime()}.${newest.id}` : 0}`
    }
    case "user": {
      const a = await prisma.user.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
  }
}

/**
 * Revisions for a set of datasets.
 *
 * Each underlying table is aggregated once even when several datasets share it,
 * which is what keeps asking for all eighteen from turning into forty queries.
 */
async function computeRevisions(
  kinds: DatasetKind[]
): Promise<Record<string, string>> {
  const tables = [...new Set(kinds.flatMap((kind) => DATASET_SOURCES[kind]))]
  const values = await Promise.all(tables.map((table) => sourceRevision(table)))
  const bySource = new Map(tables.map((table, i) => [table, values[i]]))

  const out: Record<string, string> = {}
  for (const kind of kinds) {
    out[kind] = DATASET_SOURCES[kind].map((table) => bySource.get(table)).join("~")
  }
  return out
}

// ============================================================
// Data
// ============================================================

const NAMED_SELECT = { id: true, name: true } as const
const UNIT_SELECT = { id: true, name: true, abbreviation: true } as const

/**
 * The dashboard is assembled from whatever the role is actually allowed to see.
 * A clerk with no product access gets no stock figures — and, just as
 * importantly, the query never runs.
 */
async function readDashboard(access: PermissionSet): Promise<DashboardStats> {
  const showProducts = access.canView("PRODUCT_MASTER")
  const showGrn = access.canView("INWARD_RECORD")
  const showMis = access.canView("OUTWARD_RECORD")
  const showCategories = access.canView("CATEGORY_MASTER")

  const [
    totalProducts,
    activeProducts,
    lowStockCount,
    totalGrns,
    totalMis,
    recentGrns,
    recentMis,
    categoryBreakdown,
  ] = await Promise.all([
    showProducts ? prisma.hardwareProduct.count() : 0,
    showProducts ? prisma.hardwareProduct.count({ where: { isActive: true } }) : 0,
    showProducts
      ? prisma.hardwareProduct.count({
          where: {
            isActive: true,
            currentStock: { lte: prisma.hardwareProduct.fields.minStock },
            minStock: { gt: 0 },
          },
        })
      : 0,
    showGrn ? prisma.grnHeader.count({ where: { isDeleted: false } }) : 0,
    showMis ? prisma.misHeader.count({ where: { isDeleted: false } }) : 0,
    showGrn
      ? prisma.grnHeader.findMany({
          where: { isDeleted: false },
          select: {
            id: true,
            grnNumber: true,
            date: true,
            supplier: { select: { name: true } },
            _count: { select: { items: true } },
          },
          orderBy: { date: "desc" },
          take: 5,
        })
      : [],
    showMis
      ? prisma.misHeader.findMany({
          where: { isDeleted: false },
          select: {
            id: true,
            misNumber: true,
            date: true,
            recipientType: true,
            staff: { select: { name: true } },
            _count: { select: { items: true } },
          },
          orderBy: { date: "desc" },
          take: 5,
        })
      : [],
    showProducts && showCategories
      ? prisma.hardwareProduct.groupBy({
          by: ["categoryId"],
          _count: { id: true },
          where: { isActive: true },
        })
      : [],
  ])

  const categories = categoryBreakdown.length
    ? await prisma.category.findMany({
        where: { id: { in: categoryBreakdown.map((c) => c.categoryId) } },
        select: NAMED_SELECT,
      })
    : []

  return {
    totalProducts,
    activeProducts,
    lowStockCount,
    totalGrns,
    totalMis,
    recentGrns: recentGrns.map((g) => ({
      id: g.id,
      grnNumber: g.grnNumber,
      date: g.date.toISOString(),
      supplier: g.supplier,
      itemCount: g._count.items,
    })),
    recentMis: recentMis.map((m) => ({
      id: m.id,
      misNumber: m.misNumber,
      date: m.date.toISOString(),
      recipientType: m.recipientType,
      staff: m.staff,
      itemCount: m._count.items,
    })),
    categoryData: categoryBreakdown.map((cb) => ({
      name: categories.find((c) => c.id === cb.categoryId)?.name || "Unknown",
      count: cb._count.id,
    })),
    showProducts,
    showGrn,
    showMis,
  }
}

async function readData<K extends DatasetKind>(
  kind: K,
  access: PermissionSet
): Promise<DatasetPayloads[K]> {
  type Out = DatasetPayloads[K]

  switch (kind) {
    // ---- reference lists: active rows only, id and label only ----
    case "categories":
      return (await prisma.category.findMany({
        where: { isActive: true },
        select: NAMED_SELECT,
        orderBy: { name: "asc" },
      })) as Out

    case "units":
      return (await prisma.unit.findMany({
        where: { isActive: true },
        select: UNIT_SELECT,
        orderBy: { name: "asc" },
      })) as Out

    case "bins":
      return (await prisma.bin.findMany({
        where: { isActive: true },
        select: NAMED_SELECT,
        orderBy: { name: "asc" },
      })) as Out

    case "suppliers":
      return (await prisma.supplier.findMany({
        where: { isActive: true },
        select: NAMED_SELECT,
        orderBy: { name: "asc" },
      })) as Out

    case "staff":
      return (await prisma.staff.findMany({
        where: { isActive: true },
        select: NAMED_SELECT,
        orderBy: { name: "asc" },
      })) as Out

    case "attributes":
      return (await prisma.attribute.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          isRequired: true,
          options: true,
          categories: { select: { categoryId: true } },
        },
        orderBy: { name: "asc" },
      })) as Out

    case "products":
      return (await prisma.hardwareProduct.findMany({
        where: { isActive: true },
        select: {
          id: true,
          sku: true,
          description: true,
          currentStock: true,
          lastPurchaseRate: true,
          imageUrl: true,
          aliases: { select: { alias: true } },
          unit: { select: { abbreviation: true } },
        },
        orderBy: { sku: "asc" },
      })) as Out

    // ---- master tables: every row, including deactivated ones ----
    case "categoryRows":
      return (await prisma.category.findMany({
        select: { id: true, name: true, isActive: true },
        orderBy: { name: "asc" },
      })) as Out

    case "unitRows":
      return (await prisma.unit.findMany({
        select: { id: true, name: true, abbreviation: true, isActive: true },
        orderBy: { name: "asc" },
      })) as Out

    case "binRows":
      return (await prisma.bin.findMany({
        select: { id: true, name: true, location: true, isActive: true },
        orderBy: { name: "asc" },
      })) as Out

    case "supplierRows":
      return (await prisma.supplier.findMany({
        select: {
          id: true,
          name: true,
          contactPerson: true,
          phone: true,
          email: true,
          gst: true,
          address: true,
          isActive: true,
        },
        orderBy: { name: "asc" },
      })) as Out

    case "staffRows":
      return (await prisma.staff.findMany({
        select: {
          id: true,
          name: true,
          department: true,
          employeeCode: true,
          phone: true,
          isActive: true,
        },
        orderBy: { name: "asc" },
      })) as Out

    case "attributeRows":
      return (await prisma.attribute.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          isRequired: true,
          isSearchable: true,
          options: true,
        },
        orderBy: { name: "asc" },
      })) as Out

    case "productRows":
      return (await prisma.hardwareProduct.findMany({
        select: {
          id: true,
          sku: true,
          previousSku: true,
          description: true,
          categoryId: true,
          unitId: true,
          finish: true,
          size: true,
          minStock: true,
          currentStock: true,
          openingStock: true,
          defaultBinId: true,
          imageUrl: true,
          isActive: true,
          lastPurchaseRate: true,
          category: { select: NAMED_SELECT },
          unit: { select: UNIT_SELECT },
          defaultBin: { select: NAMED_SELECT },
          aliases: { select: { id: true, alias: true } },
          attributeValues: {
            select: {
              id: true,
              value: true,
              attributeId: true,
              attribute: { select: { id: true, name: true, type: true } },
            },
          },
        },
        orderBy: { sku: "asc" },
      })) as Out

    // ---- screens. Dates are serialised so the payload is plain JSON, which is
    // what localStorage can hold; the tables parse them back for display. ----
    case "grnList": {
      const rows = await prisma.grnHeader.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          grnNumber: true,
          date: true,
          invoiceNumber: true,
          supplier: { select: { name: true } },
          createdBy: { select: { name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { date: "desc" },
        take: LIST_LIMIT,
      })
      return rows.map((r) => ({ ...r, date: r.date.toISOString() })) as Out
    }

    case "misList": {
      const rows = await prisma.misHeader.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          misNumber: true,
          date: true,
          recipientType: true,
          purpose: true,
          staff: { select: { name: true } },
          createdBy: { select: { name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { date: "desc" },
        take: LIST_LIMIT,
      })
      return rows.map((r) => ({ ...r, date: r.date.toISOString() })) as Out
    }

    case "storeLog": {
      const rows = await prisma.storeLog.findMany({
        select: {
          id: true,
          date: true,
          transactionType: true,
          referenceNumber: true,
          quantity: true,
          balanceAfter: true,
          product: { select: { sku: true, description: true } },
          supplier: { select: { name: true } },
          staff: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: { date: "desc" },
        take: LIST_LIMIT,
      })
      return rows.map((r) => ({ ...r, date: r.date.toISOString() })) as Out
    }

    case "dashboard":
      return (await readDashboard(access)) as Out
  }

  // Unreachable: `kind` is narrowed by sanitiseKinds before it gets here.
  return [] as unknown as Out
}

// ============================================================
// Public entry points
// ============================================================

/**
 * Current revision for each requested dataset. Kinds the caller may not read are
 * simply omitted, so the client keeps serving what it already has rather than
 * flapping between data and nothing.
 */
export async function fetchDatasetRevisions(
  kinds: unknown
): Promise<Partial<Record<DatasetKind, string>>> {
  const requested = sanitiseKinds(kinds)
  if (requested.length === 0) return {}

  const access = await getAccess()
  const allowed = requested.filter((kind) => mayRead(access, kind))
  if (allowed.length === 0) return {}

  const revisions = await computeRevisions(allowed)

  const result: Partial<Record<DatasetKind, string>> = {}
  for (const kind of allowed) {
    result[kind] = revisions[kind]
  }
  return result
}

/**
 * The requested datasets, each tagged with the revision it was read at so the
 * client can store the pair and skip the next fetch.
 *
 * Data and revision are read in the same call rather than in two, which keeps
 * them consistent: fetching the revision first and the rows second could
 * otherwise cache new rows under an old revision and pin the stale data in
 * place.
 */
export async function fetchDatasets(kinds: unknown): Promise<DatasetResult[]> {
  const requested = sanitiseKinds(kinds)
  if (requested.length === 0) return []

  const access = await getAccess()
  const allowed = requested.filter((kind) => mayRead(access, kind))
  if (allowed.length === 0) return []

  const [payloads, revisions] = await Promise.all([
    Promise.all(allowed.map((kind) => readData(kind, access))),
    computeRevisions(allowed),
  ])

  return allowed.map(
    (kind, i) =>
      ({ kind, revision: revisions[kind], data: payloads[i] }) as DatasetResult
  )
}
