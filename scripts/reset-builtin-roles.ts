/**
 * Resets the built-in (isSystem) roles to exactly the grants defined by their
 * templates in `lib/permissions.ts`.
 *
 * The seed only ever *adds* grants, so it can't remove one that shouldn't be
 * there. This script replaces a built-in role's grants wholesale, which is what
 * you want after changing a template or recovering from a partial migration.
 *
 * Custom (non-system) roles are never touched.
 *
 *   npx tsx scripts/reset-builtin-roles.ts
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import "dotenv/config"

import {
  expandRoleTemplate,
  PERMISSION_CATALOG,
  permissionKey,
  ROLE_TEMPLATES,
} from "../lib/permissions"

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
})

async function main() {
  console.log("♻️  Resetting built-in roles to their templates\n")

  // Make sure the catalogue exists before wiring anything to it.
  const idByKey = new Map<string, string>()
  for (const p of PERMISSION_CATALOG) {
    const perm = await prisma.permission.upsert({
      where: { module_action: { module: p.module, action: p.action } },
      update: { description: p.description },
      create: { module: p.module, action: p.action, description: p.description },
    })
    idByKey.set(permissionKey(p.module, p.action), perm.id)
  }

  for (const template of ROLE_TEMPLATES) {
    const role = await prisma.role.upsert({
      where: { name: template.name },
      update: {
        description: template.description,
        isSuperAdmin: template.isSuperAdmin ?? false,
        isSystem: template.isSystem ?? false,
      },
      create: {
        name: template.name,
        description: template.description,
        isSuperAdmin: template.isSuperAdmin ?? false,
        isSystem: template.isSystem ?? false,
      },
    })

    const grants = expandRoleTemplate(template)
    const permissionIds = grants
      .map((g) => idByKey.get(permissionKey(g.module, g.action)))
      .filter((id): id is string => Boolean(id))

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } })
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
        })
      }
    })

    console.log(
      `  ✓ ${template.name.padEnd(16)} ${String(permissionIds.length).padStart(3)} grants` +
        (template.isSuperAdmin ? "  [super admin]" : "")
    )
  }

  const custom = await prisma.role.findMany({
    where: { isSystem: false },
    include: { _count: { select: { permissions: true, users: true } } },
  })
  if (custom.length > 0) {
    console.log("\n  Custom roles left untouched:")
    for (const r of custom) {
      console.log(
        `    ${r.name.padEnd(16)} ${r._count.permissions} grants  ${r._count.users} users`
      )
    }
  }

  console.log("\n✅ Built-in roles reset.\n")
}

main()
  .catch((e) => {
    console.error("❌ Reset failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
