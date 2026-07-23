import { PrismaClient, AttributeType } from "@prisma/client";
import { PERMISSION_MATRIX } from "../lib/permissions";

import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...\n");

  // ============================================================
  // 1. Roles
  // ============================================================
  console.log("  Creating roles...");
  const adminRole = await prisma.role.upsert({
    where: { name: "Admin" },
    update: {},
    create: {
      name: "Admin",
      description: "Full system access. Manage users, masters, transactions, and audit logs.",
    },
  });

  const storeManagerRole = await prisma.role.upsert({
    where: { name: "Store Manager" },
    update: {},
    create: {
      name: "Store Manager",
      description: "Create GRNs and MIS. View masters and dashboards. Cannot edit posted transactions.",
    },
  });
  console.log(`    ✓ Admin (${adminRole.id})`);
  console.log(`    ✓ Store Manager (${storeManagerRole.id})`);

  // ============================================================
  // 2. Permissions
  // ============================================================
  console.log("\n  Creating permissions...");
  const allPermissions = new Set<string>();
  for (const perms of Object.values(PERMISSION_MATRIX)) {
    for (const p of perms) {
      allPermissions.add(`${p.module}:${p.action}`);
    }
  }

  const permissionRecords: Record<string, string> = {};
  for (const key of allPermissions) {
    const [module, action] = key.split(":");
    const perm = await prisma.permission.upsert({
      where: { module_action: { module, action } },
      update: {},
      create: {
        module,
        action,
        description: `${action} access to ${module}`,
      },
    });
    permissionRecords[key] = perm.id;
  }
  console.log(`    ✓ ${allPermissions.size} permissions created`);

  // ============================================================
  // 3. Role-Permission Mappings
  // ============================================================
  console.log("\n  Mapping permissions to roles...");
  const roleMap: Record<string, string> = {
    Admin: adminRole.id,
    "Store Manager": storeManagerRole.id,
  };

  for (const [roleName, perms] of Object.entries(PERMISSION_MATRIX)) {
    for (const p of perms) {
      const key = `${p.module}:${p.action}`;
      const permId = permissionRecords[key];
      const roleId = roleMap[roleName];

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permId } },
        update: {},
        create: { roleId, permissionId: permId },
      });
    }
    console.log(`    ✓ ${roleName}: ${perms.length} permissions mapped`);
  }

  // ============================================================
  // 4. Default Admin User (via Better Auth account)
  // ============================================================
  console.log("\n  Creating default admin user...");
  const existingAdmin = await prisma.user.findUnique({
    where: { email: "admin@hardware-erp.local" },
  });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: "admin@hardware-erp.local",
        name: "System Admin",
        roleId: adminRole.id,
        isActive: true,
        emailVerified: true,
      },
    });
    console.log("    ✓ Default admin created (admin@hardware-erp.local)");
    console.log("    ⚠ Note: Password must be set through Better Auth signup or reset flow");
  } else {
    console.log("    ✓ Admin user already exists");
  }

  // ============================================================
  // 5. Sample Categories
  // ============================================================
  console.log("\n  Creating sample categories...");
  const categories = [
    "Hinges",
    "Handles",
    "Screws",
    "Drawer Slides",
    "Locks",
    "Brackets",
    "Knobs",
    "Bolts & Nuts",
    "Channels",
    "Runners",
    "Connectors",
    "Casters",
    "Shelf Supports",
    "Catches & Latches",
    "Adhesives",
  ];

  const categoryRecords: Record<string, string> = {};
  for (const name of categories) {
    const cat = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, isActive: true },
    });
    categoryRecords[name] = cat.id;
  }
  console.log(`    ✓ ${categories.length} categories created`);

  // ============================================================
  // 6. Sample Units
  // ============================================================
  console.log("\n  Creating sample units...");
  const units = [
    { name: "Pieces", abbreviation: "Pcs" },
    { name: "Kilograms", abbreviation: "Kg" },
    { name: "Meters", abbreviation: "m" },
    { name: "Pairs", abbreviation: "Prs" },
    { name: "Sets", abbreviation: "Sets" },
    { name: "Liters", abbreviation: "L" },
    { name: "Feet", abbreviation: "Ft" },
    { name: "Numbers", abbreviation: "Nos" },
  ];

  const unitRecords: Record<string, string> = {};
  for (const u of units) {
    const unit = await prisma.unit.upsert({
      where: { name: u.name },
      update: {},
      create: { ...u, isActive: true },
    });
    unitRecords[u.name] = unit.id;
  }
  console.log(`    ✓ ${units.length} units created`);

  // Create common unit conversions
  console.log("\n  Creating unit conversions...");
  const conversions = [
    { unitName: "Pieces", purchaseUnitName: "Box (100)", conversionFactor: 100 },
    { unitName: "Pieces", purchaseUnitName: "Box (50)", conversionFactor: 50 },
    { unitName: "Pieces", purchaseUnitName: "Packet (25)", conversionFactor: 25 },
    { unitName: "Pieces", purchaseUnitName: "Dozen", conversionFactor: 12 },
    { unitName: "Kilograms", purchaseUnitName: "Grams", conversionFactor: 0.001 },
    { unitName: "Meters", purchaseUnitName: "Feet", conversionFactor: 0.3048 },
  ];

  for (const c of conversions) {
    const unitId = unitRecords[c.unitName];
    if (unitId) {
      await prisma.unitConversion.upsert({
        where: { unitId_purchaseUnitName: { unitId, purchaseUnitName: c.purchaseUnitName } },
        update: {},
        create: { unitId, purchaseUnitName: c.purchaseUnitName, conversionFactor: c.conversionFactor },
      });
    }
  }
  console.log(`    ✓ ${conversions.length} conversions created`);

  // ============================================================
  // 7. Sample Attributes
  // ============================================================
  console.log("\n  Creating sample attributes...");
  const attributes = [
    { name: "Material", type: AttributeType.DROPDOWN, isRequired: true, isSearchable: true, options: ["Stainless Steel", "Brass", "Iron", "Zinc", "Aluminum", "Plastic", "Wood"] },
    { name: "Finish Type", type: AttributeType.DROPDOWN, isRequired: false, isSearchable: true, options: ["Chrome", "Satin", "Matt Black", "Antique Brass", "Gold", "Nickel", "Powder Coated"] },
    { name: "Length (mm)", type: AttributeType.NUMBER, isRequired: false, isSearchable: true, options: [] },
    { name: "Width (mm)", type: AttributeType.NUMBER, isRequired: false, isSearchable: false, options: [] },
    { name: "Weight Capacity (Kg)", type: AttributeType.NUMBER, isRequired: false, isSearchable: false, options: [] },
    { name: "Soft Close", type: AttributeType.BOOLEAN, isRequired: false, isSearchable: true, options: [] },
    { name: "Grade", type: AttributeType.DROPDOWN, isRequired: false, isSearchable: true, options: ["Grade A", "Grade B", "Commercial", "Premium"] },
    { name: "Thread Type", type: AttributeType.DROPDOWN, isRequired: false, isSearchable: true, options: ["Coarse", "Fine", "Self-Tapping", "Machine"] },
    { name: "Head Type", type: AttributeType.DROPDOWN, isRequired: false, isSearchable: true, options: ["Pan Head", "Flat Head", "Hex Head", "Round Head", "CSK"] },
    { name: "Brand", type: AttributeType.TEXT, isRequired: false, isSearchable: true, options: [] },
  ];

  const attrRecords: Record<string, string> = {};
  for (const a of attributes) {
    // Use findFirst + create/update since attributes don't have a unique name constraint
    let attr = await prisma.attribute.findFirst({ where: { name: a.name } });
    if (!attr) {
      attr = await prisma.attribute.create({ data: a });
    }
    attrRecords[a.name] = attr.id;
  }
  console.log(`    ✓ ${attributes.length} attributes created`);

  // Map attributes to categories
  console.log("\n  Mapping attributes to categories...");
  const categoryAttributeMap: Record<string, string[]> = {
    Hinges: ["Material", "Finish Type", "Length (mm)", "Soft Close", "Brand"],
    Handles: ["Material", "Finish Type", "Length (mm)", "Brand"],
    Screws: ["Material", "Length (mm)", "Thread Type", "Head Type", "Grade"],
    "Drawer Slides": ["Material", "Length (mm)", "Weight Capacity (Kg)", "Soft Close", "Brand"],
    Locks: ["Material", "Finish Type", "Brand"],
    Brackets: ["Material", "Length (mm)", "Width (mm)", "Weight Capacity (Kg)"],
    Knobs: ["Material", "Finish Type", "Brand"],
    "Bolts & Nuts": ["Material", "Length (mm)", "Thread Type", "Grade"],
    Channels: ["Material", "Length (mm)", "Weight Capacity (Kg)"],
    Runners: ["Material", "Length (mm)", "Weight Capacity (Kg)", "Soft Close"],
  };

  for (const [catName, attrNames] of Object.entries(categoryAttributeMap)) {
    const catId = categoryRecords[catName];
    if (!catId) continue;

    for (let i = 0; i < attrNames.length; i++) {
      const attrId = attrRecords[attrNames[i]];
      if (!attrId) continue;

      const existing = await prisma.categoryAttribute.findUnique({
        where: { categoryId_attributeId: { categoryId: catId, attributeId: attrId } },
      });
      if (!existing) {
        await prisma.categoryAttribute.create({
          data: { categoryId: catId, attributeId: attrId, sortOrder: i },
        });
      }
    }
  }
  console.log("    ✓ Category-attribute mappings created");

  // ============================================================
  // 8. Sample Bins
  // ============================================================
  console.log("\n  Creating sample bins...");
  const bins = [
    { name: "A-01", location: "Rack A, Shelf 1" },
    { name: "A-02", location: "Rack A, Shelf 2" },
    { name: "A-03", location: "Rack A, Shelf 3" },
    { name: "B-01", location: "Rack B, Shelf 1" },
    { name: "B-02", location: "Rack B, Shelf 2" },
    { name: "B-03", location: "Rack B, Shelf 3" },
    { name: "C-01", location: "Rack C, Shelf 1" },
    { name: "C-02", location: "Rack C, Shelf 2" },
    { name: "FLOOR", location: "Floor Area" },
    { name: "INCOMING", location: "Incoming Goods Area" },
  ];

  for (const b of bins) {
    await prisma.bin.upsert({
      where: { name: b.name },
      update: {},
      create: { ...b, isActive: true },
    });
  }
  console.log(`    ✓ ${bins.length} bins created`);

  // ============================================================
  console.log("\n✅ Database seeded successfully!\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
