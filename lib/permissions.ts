/**
 * Permission registry — the single source of truth for the RBAC system.
 *
 * This module is deliberately *isomorphic*: it imports nothing from Prisma,
 * `next/headers`, or any server-only API. That lets the exact same definitions
 * be shared by the database seed, server components, server actions, route
 * handlers, and client components — so the sidebar, the page guard, and the
 * server action can never disagree about what a permission means.
 *
 * Anything that needs the database lives in `lib/dal.ts`.
 */

// ============================================================
// Actions
// ============================================================

export const PERMISSION_ACTIONS = [
  "VIEW",
  "CREATE",
  "EDIT",
  "DELETE",
  "EXPORT",
  "IMPORT",
] as const

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

export const ACTION_LABELS: Record<PermissionAction, string> = {
  VIEW: "View",
  CREATE: "Create",
  EDIT: "Edit",
  DELETE: "Delete",
  EXPORT: "Export",
  IMPORT: "Import",
}

/** Short help text shown next to each checkbox in the role editor. */
export const ACTION_HINTS: Record<PermissionAction, string> = {
  VIEW: "Open the section and read its records",
  CREATE: "Add new records",
  EDIT: "Change existing records",
  DELETE: "Remove or void records",
  EXPORT: "Download records as a spreadsheet",
  IMPORT: "Bulk-load records from a spreadsheet",
}

/**
 * Ordering used everywhere actions are rendered, so the role editor columns
 * always line up between modules.
 */
export const ACTION_ORDER: PermissionAction[] = [
  "VIEW",
  "CREATE",
  "EDIT",
  "DELETE",
  "EXPORT",
  "IMPORT",
]

// ============================================================
// Module groups
// ============================================================

export const MODULE_GROUPS = [
  "General",
  "Inventory",
  "Masters",
  "Analytics",
  "Administration",
] as const

export type ModuleGroup = (typeof MODULE_GROUPS)[number]

// ============================================================
// Modules
// ============================================================

export type ModuleKey =
  | "DASHBOARD"
  | "INWARD_RECORD"
  | "OUTWARD_RECORD"
  | "STORE_LOG"
  | "PRODUCT_MASTER"
  | "CATEGORY_MASTER"
  | "UNIT_MASTER"
  | "ATTRIBUTE_MASTER"
  | "BIN_MASTER"
  | "SUPPLIER_MASTER"
  | "STAFF_MASTER"
  | "REPORTS"
  | "DATA_TRANSFER"
  | "USER_MANAGEMENT"

export interface ModuleDefinition {
  key: ModuleKey
  /** Human label — used in the sidebar, the role editor, and denial screens. */
  label: string
  group: ModuleGroup
  description: string
  /** Which actions are meaningful for this module. Nothing else is grantable. */
  actions: PermissionAction[]
  /** Where the sidebar/landing redirect sends a user who holds VIEW. */
  route: string
}

const define = (m: ModuleDefinition) => m

export const MODULES: Record<ModuleKey, ModuleDefinition> = {
  DASHBOARD: define({
    key: "DASHBOARD",
    label: "Dashboard",
    group: "General",
    description: "Landing page with stock KPIs and recent activity",
    actions: ["VIEW"],
    route: "/dashboard",
  }),

  INWARD_RECORD: define({
    key: "INWARD_RECORD",
    label: "Goods Receipt (GRN)",
    group: "Inventory",
    description: "Inward stock entries received against supplier invoices",
    actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT"],
    route: "/inventory/grn",
  }),

  OUTWARD_RECORD: define({
    key: "OUTWARD_RECORD",
    label: "Material Issue (MIS)",
    group: "Inventory",
    description: "Outward stock issued to staff or departments",
    actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT"],
    route: "/inventory/mis",
  }),

  STORE_LOG: define({
    key: "STORE_LOG",
    label: "Store Log",
    group: "Inventory",
    description: "Immutable transaction ledger of every stock movement",
    actions: ["VIEW", "DELETE", "EXPORT"],
    route: "/inventory/store-log",
  }),

  PRODUCT_MASTER: define({
    key: "PRODUCT_MASTER",
    label: "Products",
    group: "Masters",
    description: "Hardware product catalogue, SKUs, and stock levels",
    actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT"],
    route: "/masters/products",
  }),

  CATEGORY_MASTER: define({
    key: "CATEGORY_MASTER",
    label: "Categories",
    group: "Masters",
    description: "Product categories and their attribute sets",
    actions: ["VIEW", "CREATE", "EDIT", "DELETE"],
    route: "/masters/categories",
  }),

  UNIT_MASTER: define({
    key: "UNIT_MASTER",
    label: "Units",
    group: "Masters",
    description: "Units of measure and purchase-unit conversions",
    actions: ["VIEW", "CREATE", "EDIT", "DELETE"],
    route: "/masters/units",
  }),

  ATTRIBUTE_MASTER: define({
    key: "ATTRIBUTE_MASTER",
    label: "Attributes",
    group: "Masters",
    description: "Custom product attributes such as material and finish",
    actions: ["VIEW", "CREATE", "EDIT", "DELETE"],
    route: "/masters/attributes",
  }),

  BIN_MASTER: define({
    key: "BIN_MASTER",
    label: "Bins",
    group: "Masters",
    description: "Physical storage bins and rack locations",
    actions: ["VIEW", "CREATE", "EDIT", "DELETE"],
    route: "/masters/bins",
  }),

  SUPPLIER_MASTER: define({
    key: "SUPPLIER_MASTER",
    label: "Suppliers",
    group: "Masters",
    description: "Supplier directory, contact details, and GST information",
    actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT"],
    route: "/masters/suppliers",
  }),

  STAFF_MASTER: define({
    key: "STAFF_MASTER",
    label: "Staff",
    group: "Masters",
    description: "Staff members who can receive issued material",
    actions: ["VIEW", "CREATE", "EDIT", "DELETE"],
    route: "/masters/staff",
  }),

  REPORTS: define({
    key: "REPORTS",
    label: "Reports",
    group: "Analytics",
    description: "Stock, purchase, supplier, and consumption reporting",
    actions: ["VIEW", "EXPORT"],
    route: "/reports",
  }),

  DATA_TRANSFER: define({
    key: "DATA_TRANSFER",
    label: "Import / Export",
    group: "Analytics",
    description: "Bulk spreadsheet import and full-dataset export",
    actions: ["VIEW", "IMPORT", "EXPORT"],
    route: "/import-export",
  }),

  USER_MANAGEMENT: define({
    key: "USER_MANAGEMENT",
    label: "Users & Roles",
    group: "Administration",
    description: "User accounts, roles, and the permission matrix itself",
    actions: ["VIEW", "CREATE", "EDIT", "DELETE"],
    route: "/users",
  }),
}

export const MODULE_LIST: ModuleDefinition[] = Object.values(MODULES)

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[]

/** Modules bucketed by group, in registry order — drives the role editor layout. */
export const MODULES_BY_GROUP: { group: ModuleGroup; modules: ModuleDefinition[] }[] =
  MODULE_GROUPS.map((group) => ({
    group,
    modules: MODULE_LIST.filter((m) => m.group === group),
  })).filter((g) => g.modules.length > 0)

export function isModuleKey(value: string): value is ModuleKey {
  return Object.prototype.hasOwnProperty.call(MODULES, value)
}

export function isPermissionAction(value: string): value is PermissionAction {
  return (PERMISSION_ACTIONS as readonly string[]).includes(value)
}

/** Label for a module, falling back to the raw key for legacy rows. */
export function moduleLabel(module: string): string {
  return isModuleKey(module) ? MODULES[module].label : module.replace(/_/g, " ")
}

// ============================================================
// Permission catalogue
// ============================================================

export interface PermissionDefinition {
  module: ModuleKey
  action: PermissionAction
  description: string
}

/**
 * Verb phrasing per action, so seeded descriptions read like sentences
 * ("Create goods receipt (GRN) records") rather than "CREATE INWARD_RECORD".
 */
const ACTION_PHRASE: Record<PermissionAction, (label: string) => string> = {
  VIEW: (l) => `View ${l.toLowerCase()}`,
  CREATE: (l) => `Create new ${l.toLowerCase()} records`,
  EDIT: (l) => `Modify existing ${l.toLowerCase()} records`,
  DELETE: (l) => `Delete ${l.toLowerCase()} records`,
  EXPORT: (l) => `Export ${l.toLowerCase()} to a spreadsheet`,
  IMPORT: (l) => `Bulk import ${l.toLowerCase()} from a spreadsheet`,
}

export function describePermission(
  module: ModuleKey,
  action: PermissionAction
): string {
  return ACTION_PHRASE[action](MODULES[module].label)
}

/** Every grantable permission. The database is synced to exactly this list. */
export const PERMISSION_CATALOG: PermissionDefinition[] = MODULE_LIST.flatMap(
  (m) =>
    m.actions.map((action) => ({
      module: m.key,
      action,
      description: describePermission(m.key, action),
    }))
)

export function permissionKey(module: string, action: string): string {
  return `${module}:${action}`
}

export function parsePermissionKey(key: string): {
  module: string
  action: string
} {
  const idx = key.indexOf(":")
  return { module: key.slice(0, idx), action: key.slice(idx + 1) }
}

/** Fast lookup of "is this module/action pair even grantable?" */
const CATALOG_KEYS = new Set(
  PERMISSION_CATALOG.map((p) => permissionKey(p.module, p.action))
)

export function isGrantablePermission(module: string, action: string): boolean {
  return CATALOG_KEYS.has(permissionKey(module, action))
}

// ============================================================
// Permission set — the runtime check object
// ============================================================

export interface PermissionSet {
  /** Raw "MODULE:ACTION" strings. Serialisable across the server/client boundary. */
  readonly keys: string[]
  /** Super admins bypass every check; used for the built-in Admin role. */
  readonly isSuperAdmin: boolean
  /** True when a real, active user backs this set. */
  readonly isAuthenticated: boolean

  can(module: ModuleKey, action: PermissionAction): boolean
  /** True if the user holds *any* granted action on the module (i.e. it exists for them). */
  canAny(module: ModuleKey): boolean
  /** True only if every listed action is granted. */
  canAll(module: ModuleKey, actions: PermissionAction[]): boolean
  /** True if the user can VIEW the module — the gate for showing nav and pages. */
  canView(module: ModuleKey): boolean
  /** Every module the user may VIEW, in registry order. */
  visibleModules(): ModuleDefinition[]
  /** All granted actions for a module, in display order. */
  actionsFor(module: ModuleKey): PermissionAction[]
}

export interface PermissionSetInit {
  keys?: string[]
  isSuperAdmin?: boolean
  isAuthenticated?: boolean
}

/**
 * Builds the check object used by both the server guard and the client hook.
 * Keeping this pure means a client component and a server action evaluate the
 * *same* logic against the *same* data.
 */
export function createPermissionSet(init: PermissionSetInit = {}): PermissionSet {
  const isSuperAdmin = init.isSuperAdmin ?? false
  const isAuthenticated = init.isAuthenticated ?? false
  const keys = init.keys ?? []
  const granted = new Set(keys)

  const can = (module: ModuleKey, action: PermissionAction): boolean => {
    if (!isAuthenticated) return false
    // A super admin still can't hold a permission the module doesn't define,
    // which keeps nonsensical checks (e.g. IMPORT on Staff) honest.
    if (!isGrantablePermission(module, action)) return false
    if (isSuperAdmin) return true
    return granted.has(permissionKey(module, action))
  }

  const actionsFor = (module: ModuleKey): PermissionAction[] => {
    const def = MODULES[module]
    if (!def) return []
    return ACTION_ORDER.filter(
      (a) => def.actions.includes(a) && can(module, a)
    )
  }

  return {
    keys,
    isSuperAdmin,
    isAuthenticated,
    can,
    canAny: (module) => actionsFor(module).length > 0,
    canAll: (module, actions) => actions.every((a) => can(module, a)),
    canView: (module) => can(module, "VIEW"),
    visibleModules: () => MODULE_LIST.filter((m) => can(m.key, "VIEW")),
    actionsFor,
  }
}

/** An empty set — logged-out, or a user whose account has been deactivated. */
export const NO_PERMISSIONS: PermissionSet = createPermissionSet()

/**
 * Where to send a user who has no access to the page they asked for.
 * Falls back to the first module they *can* see, so a GRN-only clerk lands on
 * the GRN list instead of a dashboard they're not allowed to read.
 */
export function landingRouteFor(perms: PermissionSet): string {
  if (perms.canView("DASHBOARD")) return MODULES.DASHBOARD.route
  const first = perms.visibleModules()[0]
  return first ? first.route : "/no-access"
}

// ============================================================
// Role templates (used by the seed and the "reset to template" action)
// ============================================================

export interface RoleTemplate {
  name: string
  description: string
  /** Bypasses all checks. Reserved for the built-in Admin role. */
  isSuperAdmin?: boolean
  /** Built-in roles cannot be renamed or deleted from the UI. */
  isSystem?: boolean
  permissions: Partial<Record<ModuleKey, PermissionAction[] | "ALL">>
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    name: "Admin",
    description:
      "Unrestricted access to every module, including users, roles, and permanent deletion.",
    isSuperAdmin: true,
    isSystem: true,
    permissions: Object.fromEntries(
      MODULE_LIST.map((m) => [m.key, "ALL" as const])
    ),
  },
  {
    name: "Store Manager",
    description:
      "Runs day-to-day stores: books and corrects GRN/MIS, maintains masters, reads every report.",
    isSystem: true,
    permissions: {
      DASHBOARD: ["VIEW"],
      INWARD_RECORD: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT"],
      OUTWARD_RECORD: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT"],
      STORE_LOG: ["VIEW", "EXPORT"],
      PRODUCT_MASTER: ["VIEW", "CREATE", "EDIT", "EXPORT"],
      CATEGORY_MASTER: ["VIEW", "CREATE", "EDIT"],
      UNIT_MASTER: ["VIEW", "CREATE", "EDIT"],
      ATTRIBUTE_MASTER: ["VIEW", "CREATE", "EDIT"],
      BIN_MASTER: ["VIEW", "CREATE", "EDIT"],
      SUPPLIER_MASTER: ["VIEW", "CREATE", "EDIT", "EXPORT"],
      STAFF_MASTER: ["VIEW", "CREATE", "EDIT"],
      REPORTS: ["VIEW", "EXPORT"],
      DATA_TRANSFER: ["VIEW", "EXPORT"],
    },
  },
  {
    name: "Store Clerk",
    description:
      "Books incoming and outgoing stock. Reads masters but cannot change them, and cannot delete anything.",
    isSystem: true,
    permissions: {
      DASHBOARD: ["VIEW"],
      INWARD_RECORD: ["VIEW", "CREATE"],
      OUTWARD_RECORD: ["VIEW", "CREATE"],
      STORE_LOG: ["VIEW"],
      PRODUCT_MASTER: ["VIEW"],
      CATEGORY_MASTER: ["VIEW"],
      UNIT_MASTER: ["VIEW"],
      BIN_MASTER: ["VIEW"],
      SUPPLIER_MASTER: ["VIEW"],
      STAFF_MASTER: ["VIEW"],
    },
  },
  {
    name: "Auditor",
    description:
      "Read-only across the whole system, with export rights for offline review. Changes nothing.",
    isSystem: true,
    permissions: {
      DASHBOARD: ["VIEW"],
      INWARD_RECORD: ["VIEW", "EXPORT"],
      OUTWARD_RECORD: ["VIEW", "EXPORT"],
      STORE_LOG: ["VIEW", "EXPORT"],
      PRODUCT_MASTER: ["VIEW", "EXPORT"],
      CATEGORY_MASTER: ["VIEW"],
      UNIT_MASTER: ["VIEW"],
      ATTRIBUTE_MASTER: ["VIEW"],
      BIN_MASTER: ["VIEW"],
      SUPPLIER_MASTER: ["VIEW", "EXPORT"],
      STAFF_MASTER: ["VIEW"],
      REPORTS: ["VIEW", "EXPORT"],
      DATA_TRANSFER: ["VIEW", "EXPORT"],
    },
  },
]

/** Expands a template's `"ALL"` shorthand into concrete module/action pairs. */
export function expandRoleTemplate(
  template: RoleTemplate
): { module: ModuleKey; action: PermissionAction }[] {
  const out: { module: ModuleKey; action: PermissionAction }[] = []
  for (const [key, actions] of Object.entries(template.permissions)) {
    const moduleKey = key as ModuleKey
    const def = MODULES[moduleKey]
    if (!def || !actions) continue
    const resolved = actions === "ALL" ? def.actions : actions
    for (const action of resolved) {
      // Guard against a template drifting out of sync with the module registry.
      if (def.actions.includes(action)) out.push({ module: moduleKey, action })
    }
  }
  return out
}

// ============================================================
// Migration from the previous coarse-grained scheme
// ============================================================

/**
 * The old scheme had a single `HARDWARE_MASTER` module covering products,
 * categories, units, attributes, and bins, and only VIEW/EDIT actions — where
 * "EDIT" silently meant create + update + delete.
 *
 * These maps let `syncPermissions()` upgrade existing roles in place instead of
 * silently dropping their access.
 */
export const LEGACY_MODULE_MAP: Record<string, ModuleKey[]> = {
  HARDWARE_MASTER: [
    "PRODUCT_MASTER",
    "CATEGORY_MASTER",
    "UNIT_MASTER",
    "ATTRIBUTE_MASTER",
    "BIN_MASTER",
  ],
  INWARD_RECORD: ["INWARD_RECORD"],
  OUTWARD_RECORD: ["OUTWARD_RECORD"],
  STORE_LOG: ["STORE_LOG"],
  SUPPLIER_MASTER: ["SUPPLIER_MASTER"],
  STAFF_MASTER: ["STAFF_MASTER"],
  REPORTS: ["REPORTS"],
  USER_MANAGEMENT: ["USER_MANAGEMENT"],
}

export const LEGACY_ACTION_MAP: Record<string, PermissionAction[]> = {
  VIEW: ["VIEW"],
  // Old "EDIT" was an unrestricted write grant.
  EDIT: ["CREATE", "EDIT", "DELETE"],
}

/** Translates one legacy permission row into its modern equivalents. */
export function migrateLegacyPermission(
  module: string,
  action: string
): { module: ModuleKey; action: PermissionAction }[] {
  const modules = LEGACY_MODULE_MAP[module]
  const actions = LEGACY_ACTION_MAP[action]
  if (!modules || !actions) return []

  const out: { module: ModuleKey; action: PermissionAction }[] = []
  for (const m of modules) {
    for (const a of actions) {
      if (MODULES[m].actions.includes(a)) out.push({ module: m, action: a })
    }
  }
  return out
}
