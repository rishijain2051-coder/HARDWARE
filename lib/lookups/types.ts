/**
 * Shapes for the reference lists shared by every data entry screen.
 *
 * Deliberately free of Prisma and React imports so the same definitions can be
 * used by the server action that reads the database, the client cache that
 * stores the result, and the components that render it.
 */

/**
 * Every list the cache knows how to fetch. Doubles as the allowlist for the
 * server action, which is why it is a const tuple rather than a bare union: the
 * kinds arrive from the client and have to be validated against something at
 * runtime.
 */
export const LOOKUP_KINDS = [
  "categories",
  "units",
  "bins",
  "suppliers",
  "staff",
  "attributes",
  "products",
] as const

export type LookupKind = (typeof LOOKUP_KINDS)[number]

export function isLookupKind(value: unknown): value is LookupKind {
  return typeof value === "string" && (LOOKUP_KINDS as readonly string[]).includes(value)
}

export interface NamedRecord {
  id: string
  name: string
}

export interface UnitRecord {
  id: string
  name: string
  abbreviation: string
}

export interface AttributeRecord {
  id: string
  name: string
  type: string
  isRequired: boolean
  options: string[]
  /** Categories this attribute applies to; empty means "all categories". */
  categories: { categoryId: string }[]
}

/**
 * The product fields the comboboxes actually render. Everything else on
 * HardwareProduct — search vectors, rate history, timestamps — stays on the
 * server; a store with a few thousand SKUs is the difference between a list
 * worth caching and one that blows the localStorage quota.
 */
export interface ProductRecord {
  id: string
  sku: string
  description: string
  currentStock: number
  lastPurchaseRate: number | null
  imageUrl: string | null
  aliases: { alias: string }[]
  unit: { abbreviation: string } | null
}

export interface LookupPayloads {
  categories: NamedRecord[]
  units: UnitRecord[]
  bins: NamedRecord[]
  suppliers: NamedRecord[]
  staff: NamedRecord[]
  attributes: AttributeRecord[]
  products: ProductRecord[]
}

/** One list as returned by the server: the rows plus the revision they match. */
export interface LookupResult<K extends LookupKind = LookupKind> {
  kind: K
  revision: string
  rows: LookupPayloads[K]
}

/**
 * How long a cached list is served without so much as a revision check.
 *
 * Masters are edited a few times a week, so a minute of staleness in a dropdown
 * costs nothing; products get a shorter window because stock figures move with
 * every entry and are shown next to the SKU. Anything a user changes themselves
 * is invalidated explicitly on save, so these only bound how long *another*
 * terminal's edit takes to show up.
 */
export const LOOKUP_TTL_MS: Record<LookupKind, number> = {
  categories: 10 * 60_000,
  units: 10 * 60_000,
  bins: 10 * 60_000,
  suppliers: 5 * 60_000,
  staff: 5 * 60_000,
  attributes: 10 * 60_000,
  products: 60_000,
}

/** localStorage key for a list. Prefixed so a kind can never collide with a UI pref. */
export function lookupCacheKey(kind: LookupKind): string {
  return `lookup.${kind}`
}
