"use server"

import { prisma } from "@/lib/prisma"
import { getAccess } from "@/lib/dal"
import type { ModuleKey, PermissionAction, PermissionSet } from "@/lib/permissions"
import {
  isLookupKind,
  type LookupKind,
  type LookupPayloads,
  type LookupResult,
} from "./types"

/**
 * Server side of the client lookup cache.
 *
 * Two entry points, both batched so a screen needs at most one round trip:
 *
 *   fetchLookupRevisions(kinds) — cheap "has anything changed?" probe
 *   fetchLookups(kinds)         — the rows themselves
 *
 * Everything a client can reach is a public HTTP endpoint, so `kinds` is
 * validated against the allowlist in ./types and every list carries its own
 * permission gate. A caller asking for a list they may not see gets an empty
 * array, matching how the existing read actions behave.
 */

/**
 * Which permissions entitle a user to read each list.
 *
 * A reference list is readable if the user can browse that master *or* if they
 * hold a permission for a screen that cannot be filled in without it — you
 * cannot book a सामान आया without picking a supplier, so INWARD_RECORD:CREATE
 * has to imply reading supplier names even for a clerk with no supplier master
 * access. That is the rule the pages already followed implicitly by fetching
 * these lists behind a single page-level guard; it is written down here instead.
 */
const LOOKUP_GATES: Record<LookupKind, readonly (readonly [ModuleKey, PermissionAction])[]> = {
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
}

function mayRead(access: PermissionSet, kind: LookupKind): boolean {
  return LOOKUP_GATES[kind].some(([module, action]) => access.can(module, action))
}

/**
 * Narrows an untrusted argument to known kinds, de-duplicated and capped.
 *
 * The cap matters: without it a caller could pass the same kind a thousand times
 * and turn one action call into a thousand database round trips.
 */
function sanitiseKinds(input: unknown): LookupKind[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<LookupKind>()
  for (const value of input) {
    if (isLookupKind(value)) seen.add(value)
  }
  return [...seen]
}

// ============================================================
// Revisions
// ============================================================

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

async function readRevision(kind: LookupKind): Promise<string> {
  switch (kind) {
    case "categories": {
      const a = await prisma.category.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
    case "units": {
      const a = await prisma.unit.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
    case "bins": {
      const a = await prisma.bin.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
    case "suppliers": {
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
    case "attributes": {
      // The category links live in their own table with no timestamp of its
      // own, so attaching an attribute to a category would otherwise leave the
      // revision unchanged. Its row count covers that.
      const [a, links] = await Promise.all([
        prisma.attribute.aggregate({
          _count: { _all: true },
          _max: { updatedAt: true },
        }),
        prisma.categoryAttribute.count(),
      ])
      return `${revisionOf(a._count._all, a._max.updatedAt)}.${links}`
    }
    case "products": {
      const a = await prisma.hardwareProduct.aggregate({
        _count: { _all: true },
        _max: { updatedAt: true },
      })
      return revisionOf(a._count._all, a._max.updatedAt)
    }
  }
}

/**
 * Current revision for each requested list. Kinds the caller may not read are
 * simply omitted, so the client keeps serving what it already has rather than
 * flapping between a list and an empty one.
 */
export async function fetchLookupRevisions(
  kinds: unknown
): Promise<Partial<Record<LookupKind, string>>> {
  const requested = sanitiseKinds(kinds)
  if (requested.length === 0) return {}

  const access = await getAccess()
  const allowed = requested.filter((kind) => mayRead(access, kind))
  if (allowed.length === 0) return {}

  const revisions = await Promise.all(allowed.map((kind) => readRevision(kind)))

  const result: Partial<Record<LookupKind, string>> = {}
  allowed.forEach((kind, i) => {
    result[kind] = revisions[i]
  })
  return result
}

// ============================================================
// Rows
// ============================================================

const NAMED_SELECT = { id: true, name: true } as const

async function readRows<K extends LookupKind>(kind: K): Promise<LookupPayloads[K]> {
  switch (kind) {
    case "categories":
      return (await prisma.category.findMany({
        where: { isActive: true },
        select: NAMED_SELECT,
        orderBy: { name: "asc" },
      })) as LookupPayloads[K]

    case "units":
      return (await prisma.unit.findMany({
        where: { isActive: true },
        select: { id: true, name: true, abbreviation: true },
        orderBy: { name: "asc" },
      })) as LookupPayloads[K]

    case "bins":
      return (await prisma.bin.findMany({
        where: { isActive: true },
        select: NAMED_SELECT,
        orderBy: { name: "asc" },
      })) as LookupPayloads[K]

    case "suppliers":
      return (await prisma.supplier.findMany({
        where: { isActive: true },
        select: NAMED_SELECT,
        orderBy: { name: "asc" },
      })) as LookupPayloads[K]

    case "staff":
      return (await prisma.staff.findMany({
        where: { isActive: true },
        select: NAMED_SELECT,
        orderBy: { name: "asc" },
      })) as LookupPayloads[K]

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
      })) as LookupPayloads[K]

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
      })) as LookupPayloads[K]
  }

  // Unreachable: `kind` is narrowed by sanitiseKinds before it gets here.
  return [] as unknown as LookupPayloads[K]
}

/**
 * The requested lists, each tagged with the revision it was read at so the
 * client can store the pair and skip the next fetch.
 *
 * Rows and revision are read in the same call rather than in two, which keeps
 * them consistent: fetching the revision first and the rows second could
 * otherwise cache new rows under an old revision and pin the stale data in
 * place.
 */
export async function fetchLookups(kinds: unknown): Promise<LookupResult[]> {
  const requested = sanitiseKinds(kinds)
  if (requested.length === 0) return []

  const access = await getAccess()
  const allowed = requested.filter((kind) => mayRead(access, kind))
  if (allowed.length === 0) return []

  return await Promise.all(
    allowed.map(async (kind) => {
      const [rows, revision] = await Promise.all([readRows(kind), readRevision(kind)])
      return { kind, revision, rows } as LookupResult
    })
  )
}
