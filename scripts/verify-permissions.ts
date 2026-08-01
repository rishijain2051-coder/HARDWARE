/**
 * Verification harness for the RBAC system.
 *
 * Loads every role from the database, rebuilds the exact `PermissionSet` the
 * app would use, and reports which sidebar sections and row actions each role
 * gets. Also asserts the invariants that matter, so a future change to the
 * registry or a role's grants can't quietly widen access.
 *
 *   npx tsx scripts/verify-permissions.ts
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import "dotenv/config"

import {
  createPermissionSet,
  isModuleKey,
  isPermissionAction,
  MODULES,
  permissionKey,
  type ModuleKey,
  type PermissionAction,
  type PermissionSet,
} from "../lib/permissions"
// The *real* sidebar filter and tree the app renders — not a copy, so this
// harness cannot pass while the actual navigation says something different.
import { filterNavTree, NAV_TREE } from "../lib/navigation"

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
})

function renderNav(perms: PermissionSet): string[] {
  const out: string[] = []
  for (const item of filterNavTree(NAV_TREE, perms)) {
    out.push(item.label)
    for (const child of item.children ?? []) out.push(`  └ ${child.label}`)
  }
  return out
}

let failures = 0
function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`    ✓ ${label}`)
  } else {
    console.log(`    ✗ ${label}`)
    failures++
  }
}

async function main() {
  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
    orderBy: [{ isSuperAdmin: "desc" }, { name: "asc" }],
  })

  const sets = new Map<string, PermissionSet>()

  for (const role of roles) {
    const keys = role.permissions
      .map((rp) => rp.permission)
      .filter((p) => isModuleKey(p.module) && isPermissionAction(p.action))
      .map((p) => permissionKey(p.module, p.action))

    const perms = createPermissionSet({
      keys,
      isSuperAdmin: role.isSuperAdmin,
      isAuthenticated: true,
    })
    sets.set(role.name, perms)

    console.log(`\n${"=".repeat(60)}`)
    console.log(`${role.name}${role.isSuperAdmin ? "  [super admin]" : ""}`)
    console.log("=".repeat(60))

    console.log("\n  Sidebar:")
    const nav = renderNav(perms)
    if (nav.length === 0) console.log("    (nothing — lands on /no-access)")
    for (const line of nav) console.log(`    ${line}`)

    console.log("\n  Write actions:")
    const writes: string[] = []
    for (const key of Object.keys(MODULES) as ModuleKey[]) {
      const granted = perms
        .actionsFor(key)
        .filter((a: PermissionAction) => a !== "VIEW")
      if (granted.length > 0) {
        writes.push(`    ${MODULES[key].label.padEnd(22)} ${granted.join(", ")}`)
      }
    }
    console.log(writes.length ? writes.join("\n") : "    (read-only)")
  }

  // ----------------------------------------------------------
  console.log(`\n${"=".repeat(60)}`)
  console.log("Invariants")
  console.log("=".repeat(60))

  const anon = createPermissionSet()
  console.log("\n  Signed out / deactivated:")
  assert("sees no sidebar sections", renderNav(anon).length === 0)
  assert("cannot view GRN", !anon.can("INWARD_RECORD", "VIEW"))
  assert("cannot manage users", !anon.can("USER_MANAGEMENT", "EDIT"))

  const admin = sets.get("Admin")
  if (admin) {
    console.log("\n  Admin:")
    assert("sees every section", renderNav(admin).length >= 13)
    assert("can delete GRN", admin.can("INWARD_RECORD", "DELETE"))
    assert("can manage users", admin.can("USER_MANAGEMENT", "EDIT"))
    assert(
      "still cannot hold an undefined action (IMPORT on Staff)",
      !admin.can("STAFF_MASTER", "IMPORT")
    )
  }

  const clerk = sets.get("Store Clerk")
  if (clerk) {
    console.log("\n  Store Clerk:")
    assert("can book a GRN", clerk.can("INWARD_RECORD", "CREATE"))
    assert("cannot delete a GRN", !clerk.can("INWARD_RECORD", "DELETE"))
    assert("cannot edit a posted GRN", !clerk.can("INWARD_RECORD", "EDIT"))
    assert("can read products", clerk.can("PRODUCT_MASTER", "VIEW"))
    assert("cannot create products", !clerk.can("PRODUCT_MASTER", "CREATE"))
    assert("has no Users & Roles section", !clerk.canView("USER_MANAGEMENT"))
    assert("has no Reports section", !clerk.canView("REPORTS"))
    assert("has no Import/Export section", !clerk.canView("DATA_TRANSFER"))
  }

  const auditor = sets.get("Auditor")
  if (auditor) {
    console.log("\n  Auditor:")
    const anyWrite = (Object.keys(MODULES) as ModuleKey[]).some((m) =>
      (["CREATE", "EDIT", "DELETE", "IMPORT"] as PermissionAction[]).some((a) =>
        auditor.can(m, a)
      )
    )
    assert("holds no create/edit/delete/import anywhere", !anyWrite)
    assert("can export the store log", auditor.can("STORE_LOG", "EXPORT"))
    assert("cannot see Users & Roles", !auditor.canView("USER_MANAGEMENT"))
  }

  const manager = sets.get("Store Manager")
  if (manager) {
    console.log("\n  Store Manager:")
    assert("can delete a GRN", manager.can("INWARD_RECORD", "DELETE"))
    assert("cannot manage users", !manager.can("USER_MANAGEMENT", "EDIT"))
    assert("has no Users & Roles section", !manager.canView("USER_MANAGEMENT"))
    assert("cannot delete store log entries", !manager.can("STORE_LOG", "DELETE"))
    assert("cannot bulk-import products", !manager.can("DATA_TRANSFER", "IMPORT"))
  }

  console.log(
    `\n${failures === 0 ? "✅ All invariants hold." : `❌ ${failures} invariant(s) failed.`}\n`
  )
  if (failures > 0) process.exitCode = 1
}

main().finally(() => prisma.$disconnect())
