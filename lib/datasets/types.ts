/**
 * Shapes for the server data that is cached in the browser.
 *
 * Deliberately free of Prisma and React imports so the same definitions can be
 * used by the server action that reads the database, the client cache that
 * stores the result, and the components that render it.
 *
 * Two families live here, and the split is a permission boundary rather than
 * duplication:
 *
 *   reference lists ("suppliers", "units", ...) are slim — an id and a name —
 *   and readable by anyone who can fill in a form that needs them. A clerk has
 *   to see supplier names to book a सामान आया.
 *
 *   row sets ("supplierRows", "unitRows", ...) are the full records behind the
 *   master tables, including contact details, and are gated on that master's own
 *   VIEW. Merging the two would mean handing every clerk a supplier's phone
 *   number and GST number.
 */

/**
 * Every dataset the cache knows how to fetch. Doubles as the allowlist for the
 * server action, which is why it is a const tuple rather than a bare union: the
 * kinds arrive from the client and have to be validated against something at
 * runtime.
 */
export const DATASET_KINDS = [
  // Reference lists — slim, broadly readable, for dropdowns and comboboxes.
  "categories",
  "units",
  "bins",
  "suppliers",
  "staff",
  "attributes",
  "products",

  // Full rows behind the master tables.
  "categoryRows",
  "unitRows",
  "binRows",
  "supplierRows",
  "staffRows",
  "attributeRows",
  "productRows",

  // Screen data.
  "grnList",
  "misList",
  "storeLog",
  "dashboard",
] as const

export type DatasetKind = (typeof DATASET_KINDS)[number]

export function isDatasetKind(value: unknown): value is DatasetKind {
  return typeof value === "string" && (DATASET_KINDS as readonly string[]).includes(value)
}

// ============================================================
// Reference lists
// ============================================================

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

// ============================================================
// Master table rows
// ============================================================

export interface CategoryRow {
  id: string
  name: string
  isActive: boolean
}

export interface UnitRow {
  id: string
  name: string
  abbreviation: string
  isActive: boolean
}

export interface BinRow {
  id: string
  name: string
  location: string | null
  isActive: boolean
}

export interface SupplierRow {
  id: string
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  gst: string | null
  address: string | null
  isActive: boolean
}

export interface StaffRow {
  id: string
  name: string
  department: string | null
  employeeCode: string | null
  phone: string | null
  isActive: boolean
}

export interface AttributeRow {
  id: string
  name: string
  type: string
  isRequired: boolean
  isSearchable: boolean
  options: string[]
}

export interface ProductRow {
  id: string
  sku: string
  previousSku: string | null
  description: string
  categoryId: string
  unitId: string
  finish: string | null
  size: string | null
  minStock: number
  currentStock: number
  openingStock: number
  defaultBinId: string | null
  imageUrl: string | null
  isActive: boolean
  lastPurchaseRate: number | null
  category: NamedRecord | null
  unit: UnitRecord | null
  defaultBin: NamedRecord | null
  aliases: { id: string; alias: string }[]
  attributeValues: {
    id: string
    value: string
    attributeId: string
    attribute: { id: string; name: string; type: string }
  }[]
}

// ============================================================
// Screen data
// ============================================================

/** Dates cross the wire as ISO strings; the tables parse them for display. */
export interface GrnListRow {
  id: string
  grnNumber: string
  date: string
  invoiceNumber: string | null
  supplier: { name: string } | null
  createdBy: { name: string } | null
  _count: { items: number }
}

export interface MisListRow {
  id: string
  misNumber: string
  date: string
  recipientType: string
  purpose: string | null
  staff: { name: string } | null
  createdBy: { name: string } | null
  _count: { items: number }
}

export interface StoreLogRow {
  id: string
  date: string
  transactionType: string
  referenceNumber: string
  quantity: number
  balanceAfter: number
  product: { sku: string; description: string } | null
  supplier: { name: string } | null
  staff: { name: string } | null
  createdBy: { name: string } | null
}

export interface DashboardRecentGrn {
  id: string
  grnNumber: string
  date: string
  supplier: { name: string } | null
  itemCount: number
}

export interface DashboardRecentMis {
  id: string
  misNumber: string
  date: string
  recipientType: string
  staff: { name: string } | null
  itemCount: number
}

/**
 * The dashboard is assembled from whatever the role may see, so the flags travel
 * with the figures. It is the one dataset that is an object rather than a list.
 */
export interface DashboardStats {
  totalProducts: number
  activeProducts: number
  lowStockCount: number
  totalGrns: number
  totalMis: number
  recentGrns: DashboardRecentGrn[]
  recentMis: DashboardRecentMis[]
  categoryData: { name: string; count: number }[]
  showProducts: boolean
  showGrn: boolean
  showMis: boolean
}

// ============================================================
// Registry
// ============================================================

export interface DatasetPayloads {
  categories: NamedRecord[]
  units: UnitRecord[]
  bins: NamedRecord[]
  suppliers: NamedRecord[]
  staff: NamedRecord[]
  attributes: AttributeRecord[]
  products: ProductRecord[]

  categoryRows: CategoryRow[]
  unitRows: UnitRow[]
  binRows: BinRow[]
  supplierRows: SupplierRow[]
  staffRows: StaffRow[]
  attributeRows: AttributeRow[]
  productRows: ProductRow[]

  grnList: GrnListRow[]
  misList: MisListRow[]
  storeLog: StoreLogRow[]
  dashboard: DashboardStats
}

/** The kinds whose payload is a list, which is all of them but the dashboard. */
export type ListDatasetKind = {
  [K in DatasetKind]: DatasetPayloads[K] extends readonly unknown[] ? K : never
}[DatasetKind]

/** One dataset as returned by the server: the payload plus the revision it matches. */
export interface DatasetResult<K extends DatasetKind = DatasetKind> {
  kind: K
  revision: string
  data: DatasetPayloads[K]
}

/**
 * How long a cached dataset is served without so much as a revision check.
 *
 * Masters are edited a few times a week, so a minute of staleness in a dropdown
 * costs nothing. Anything that moves with each transaction — the entry lists,
 * the ledger, the dashboard figures, and the stock numbers shown beside a SKU —
 * gets a short window instead. Whatever a user changes themselves is invalidated
 * explicitly on save, so these only bound how long *another* terminal's edit
 * takes to show up.
 */
export const DATASET_TTL_MS: Record<DatasetKind, number> = {
  categories: 10 * 60_000,
  units: 10 * 60_000,
  bins: 10 * 60_000,
  suppliers: 5 * 60_000,
  staff: 5 * 60_000,
  attributes: 10 * 60_000,
  products: 60_000,

  categoryRows: 5 * 60_000,
  unitRows: 5 * 60_000,
  binRows: 5 * 60_000,
  supplierRows: 5 * 60_000,
  staffRows: 5 * 60_000,
  attributeRows: 5 * 60_000,
  productRows: 60_000,

  grnList: 60_000,
  misList: 60_000,
  storeLog: 60_000,
  dashboard: 60_000,
}

/**
 * What a mutation invalidates.
 *
 * Declared once, here, rather than at each call site: booking stock touches the
 * entry list, the ledger, the dashboard figures and both product datasets, and
 * expecting every save handler to remember that fan-out is how a cache starts
 * serving yesterday's numbers.
 */
export const DATASET_GROUPS = {
  /**
   * The master edits reach further than they look. The product table joins
   * category, unit, default-bin and attribute names into every row, so renaming a
   * unit changes what /masters/products shows without touching a product row.
   *
   * DATASET_SOURCES in ./actions.ts makes the *revisions* aware of the same
   * relationships, which is what covers a second terminal. These groups are the
   * local half: they make the change immediate for whoever made it.
   */
  categories: ["categories", "categoryRows", "productRows", "dashboard"],
  units: ["units", "unitRows", "products", "productRows"],
  bins: ["bins", "binRows", "productRows"],
  suppliers: ["suppliers", "supplierRows", "grnList", "storeLog"],
  staff: ["staff", "staffRows", "misList", "storeLog"],
  /** Attribute definitions decide which fields a product form shows. */
  attributes: ["attributes", "attributeRows", "productRows"],
  products: ["products", "productRows", "storeLog", "dashboard"],
  /** A सामान आया: stock in, so the ledger and stock figures move too. */
  inward: ["grnList", "storeLog", "products", "productRows", "dashboard"],
  /** A सामान दिया: stock out. */
  outward: ["misList", "storeLog", "products", "productRows", "dashboard"],
  /** Rewriting the ledger recalculates running balances, hence stock. */
  storeLog: ["storeLog", "products", "productRows", "dashboard"],
  /** A spreadsheet import creates categories, units and bins as it goes. */
  import: [
    "products",
    "productRows",
    "categories",
    "categoryRows",
    "units",
    "unitRows",
    "bins",
    "binRows",
    "dashboard",
  ],
} as const satisfies Record<string, readonly DatasetKind[]>

export type MutationTopic = keyof typeof DATASET_GROUPS

/** localStorage key for a dataset. Prefixed so a kind can never collide with a UI pref. */
export function datasetCacheKey(kind: DatasetKind): string {
  return `data.${kind}`
}
