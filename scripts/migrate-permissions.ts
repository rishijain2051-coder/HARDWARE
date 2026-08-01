/**
 * One-off migration from the old coarse permission scheme to the module
 * registry in `lib/permissions.ts`.
 *
 * The old scheme had a single HARDWARE_MASTER module covering products,
 * categories, units, attributes and bins, and only VIEW/EDIT actions — where
 * "EDIT" implicitly meant create + update + delete.
 *
 * Order matters: existing grants are read and translated *before* obsolete
 * permission rows are deleted, because `role_permissions` cascades on delete.
 *
 *   npx tsx scripts/migrate-permissions.ts
 *
 * Safe to re-run; every write is an upsert.
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import "dotenv/config"

import {
  expandRoleTemplate,
  isGrantablePermission,
  LEGACY_ACTION_MAP,
  LEGACY_MODULE_MAP,
  migrateLegacyPermission,
  PERMISSION_CATALOG,
  permissionKey,
  ROLE_TEMPLATES,
} from "../lib/permissions"

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg(connectionString)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("🔐 Migrating permissions to the module registry\n")

  // ----------------------------------------------------------
  // 1. Snapshot what every role currently holds, in module/action terms.
  // ----------------------------------------------------------
  const rolesBefore = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
  })

  const legacyGrants = new Map<string, Set<string>>()
  for (const role of rolesBefore) {
    const keys = new Set<string>()
    for (const rp of role.permissions) {
      const { module, action } = rp.permission

      // Several module names (INWARD_RECORD, STORE_LOG, ...) exist in BOTH the
      // old and new vocabularies, and so does "EDIT" — but they don't mean the
      // same thing: legacy EDIT was an unrestricted write grant covering
      // create + update + delete. Since this script only ever runs against a
      // pre-migration database, a pair that is expressible in legacy terms is
      // always interpreted as legacy. Checking "is this valid today?" first
      // would silently strip CREATE and DELETE from every affected role.
      const isLegacyPair =
        Boolean(LEGACY_MODULE_MAP[module]) && Boolean(LEGACY_ACTION_MAP[action])

      if (isLegacyPair) {
        for (const mapped of migrateLegacyPermission(module, action)) {
          keys.add(permissionKey(mapped.module, mapped.action))
        }
      } else if (isGrantablePermission(module, action)) {
        // A pair only the new scheme can express (CREATE/DELETE/EXPORT/IMPORT).
        keys.add(permissionKey(module, action))
      }
      // Anything else is from a discarded scheme and is dropped.
    }
    legacyGrants.set(role.id, keys)
    console.log(
      `  ${role.name}: ${role.permissions.length} old → ${keys.size} new grants`
    )
  }

  // ----------------------------------------------------------
  // 2. Make sure every catalogue permission exists.
  // ----------------------------------------------------------
  console.log("\n  Syncing permission catalogue...")
  const idByKey = new Map<string, string>()
  for (const p of PERMISSION_CATALOG) {
    const perm = await prisma.permission.upsert({
      where: { module_action: { module: p.module, action: p.action } },
      update: { description: p.description },
      create: { module: p.module, action: p.action, description: p.description },
    })
    idByKey.set(permissionKey(p.module, p.action), perm.id)
  }
  console.log(`    ✓ ${idByKey.size} permissions present`)

  // ----------------------------------------------------------
  // 3. Flag the built-in roles.
  // ----------------------------------------------------------
  console.log("\n  Applying built-in role flags...")
  for (const template of ROLE_TEMPLATES) {
    const existing = await prisma.role.findUnique({ where: { name: template.name } })
    if (existing) {
      await prisma.role.update({
        where: { id: existing.id },
        data: {
          description: existing.description ?? template.description,
          isSuperAdmin: template.isSuperAdmin ?? false,
          isSystem: template.isSystem ?? false,
        },
      })
      console.log(`    ✓ ${template.name} (existing)`)
    } else {
      const created = await prisma.role.create({
        data: {
          name: template.name,
          description: template.description,
          isSuperAdmin: template.isSuperAdmin ?? false,
          isSystem: template.isSystem ?? false,
        },
      })
      // A brand-new built-in role starts from its template rather than from
      // migrated grants it never had.
      legacyGrants.set(
        created.id,
        new Set(
          expandRoleTemplate(template).map((g) => permissionKey(g.module, g.action))
        )
      )
      console.log(`    ✓ ${template.name} (created from template)`)
    }
  }

  // Also catch the legacy uppercase "ADMIN" role some code used to create.
  const strayAdmin = await prisma.role.findFirst({ where: { name: "ADMIN" } })
  if (strayAdmin) {
    await prisma.role.update({
      where: { id: strayAdmin.id },
      data: { isSuperAdmin: true, isSystem: true },
    })
    console.log(`    ✓ ADMIN (legacy alias) marked as super admin`)
  }

  // ----------------------------------------------------------
  // 4. Re-apply the translated grants.
  // ----------------------------------------------------------
  console.log("\n  Re-applying grants...")
  for (const [roleId, keys] of legacyGrants) {
    let applied = 0
    for (const key of keys) {
      const permissionId = idByKey.get(key)
      if (!permissionId) continue
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      })
      applied++
    }
    if (applied > 0) {
      const role = await prisma.role.findUnique({ where: { id: roleId } })
      console.log(`    ✓ ${role?.name}: ${applied} grants`)
    }
  }

  // The super-admin role bypasses checks anyway, but granting everything keeps
  // the UI honest and survives the flag being cleared.
  const superAdmins = await prisma.role.findMany({ where: { isSuperAdmin: true } })
  for (const role of superAdmins) {
    for (const permissionId of idByKey.values()) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      })
    }
    console.log(`    ✓ ${role.name}: granted all ${idByKey.size} permissions`)
  }

  // ----------------------------------------------------------
  // 5. Remove obsolete permission rows (cascades to role_permissions).
  // ----------------------------------------------------------
  console.log("\n  Removing obsolete permissions...")
  const all = await prisma.permission.findMany({
    select: { id: true, module: true, action: true },
  })
  const obsolete = all.filter(
    (p) => !idByKey.has(permissionKey(p.module, p.action))
  )
  if (obsolete.length > 0) {
    await prisma.permission.deleteMany({
      where: { id: { in: obsolete.map((p) => p.id) } },
    })
    for (const p of obsolete) console.log(`    − ${p.module}:${p.action}`)
  } else {
    console.log("    ✓ none")
  }

  // ----------------------------------------------------------
  // 6. Report.
  // ----------------------------------------------------------
  console.log("\n  Final state:")
  const rolesAfter = await prisma.role.findMany({
    include: { _count: { select: { permissions: true, users: true } } },
    orderBy: [{ isSuperAdmin: "desc" }, { name: "asc" }],
  })
  for (const r of rolesAfter) {
    const tags = [
      r.isSuperAdmin ? "super-admin" : null,
      r.isSystem ? "built-in" : null,
    ]
      .filter(Boolean)
      .join(", ")
    console.log(
      `    ${r.name.padEnd(16)} ${String(r._count.permissions).padStart(3)} perms  ` +
        `${r._count.users} users${tags ? `  [${tags}]` : ""}`
    )
  }

  console.log("\n✅ Permission migration complete.\n")
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
