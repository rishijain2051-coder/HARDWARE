import { TXN_LABELS } from "./labels"
import type { ModuleKey, PermissionSet } from "./permissions"

/**
 * The sidebar structure, kept free of JSX so it can be imported by plain
 * Node scripts as well as the client component.
 *
 * Icons are referenced by key and resolved to components in the sidebar; that
 * keeps this file importable from `scripts/verify-permissions.ts`, which runs
 * the real `filterNavTree` rather than a copy that could drift out of sync.
 */

export type NavIcon =
  | "dashboard"
  | "inventory"
  | "grn"
  | "mis"
  | "storeLog"
  | "masters"
  | "product"
  | "category"
  | "supplier"
  | "staff"
  | "unit"
  | "attribute"
  | "bin"
  | "reports"
  | "dataTransfer"
  | "users"

export interface NavNode {
  label: string
  href: string
  icon: NavIcon
  /**
   * The module gating this entry. Required on leaves — a leaf without one
   * would be unguarded, so `filterNavTree` drops it rather than showing it.
   * Omitted on group headers, whose visibility derives from their children.
   */
  module?: ModuleKey
  children?: NavNode[]
}

export const NAV_TREE: NavNode[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "dashboard",
    module: "DASHBOARD",
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: "inventory",
    children: [
      {
        label: TXN_LABELS.inward,
        href: "/inventory/grn",
        icon: "grn",
        module: "INWARD_RECORD",
      },
      {
        label: TXN_LABELS.outward,
        href: "/inventory/mis",
        icon: "mis",
        module: "OUTWARD_RECORD",
      },
      {
        label: "Store Log",
        href: "/inventory/store-log",
        icon: "storeLog",
        module: "STORE_LOG",
      },
    ],
  },
  {
    label: "Masters",
    href: "/masters",
    icon: "masters",
    children: [
      {
        label: "Products",
        href: "/masters/products",
        icon: "product",
        module: "PRODUCT_MASTER",
      },
      {
        label: "Categories",
        href: "/masters/categories",
        icon: "category",
        module: "CATEGORY_MASTER",
      },
      {
        label: "Suppliers",
        href: "/masters/suppliers",
        icon: "supplier",
        module: "SUPPLIER_MASTER",
      },
      {
        label: "Staff",
        href: "/masters/staff",
        icon: "staff",
        module: "STAFF_MASTER",
      },
      {
        label: "Units",
        href: "/masters/units",
        icon: "unit",
        module: "UNIT_MASTER",
      },
      {
        label: "Attributes",
        href: "/masters/attributes",
        icon: "attribute",
        module: "ATTRIBUTE_MASTER",
      },
      {
        label: "Bins",
        href: "/masters/bins",
        icon: "bin",
        module: "BIN_MASTER",
      },
    ],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: "reports",
    module: "REPORTS",
  },
  {
    label: "Import / Export",
    href: "/import-export",
    icon: "dataTransfer",
    module: "DATA_TRANSFER",
  },
  {
    label: "Users & Roles",
    href: "/users",
    icon: "users",
    module: "USER_MANAGEMENT",
  },
]

/**
 * Prunes the tree against a permission set.
 *
 * A leaf survives only if its module is viewable; a group survives only if at
 * least one child survived. Entries are removed from the tree outright rather
 * than disabled, so a section the role can't open leaves no trace in the UI.
 */
export function filterNavTree(
  items: NavNode[],
  perms: Pick<PermissionSet, "canView">
): NavNode[] {
  const out: NavNode[] = []

  for (const item of items) {
    if (item.children) {
      const children = filterNavTree(item.children, perms)
      if (children.length > 0) out.push({ ...item, children })
      continue
    }

    if (item.module && perms.canView(item.module)) out.push(item)
  }

  return out
}
