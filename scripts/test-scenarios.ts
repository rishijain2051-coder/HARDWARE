/**
 * End-to-end scenario harness for the RBAC system.
 *
 * Exercises the real stack over HTTP — proxy.ts -> page guard -> DAL -> Prisma —
 * by logging in as purpose-built roles and asserting what each one can reach.
 * Deliberately HTTP-level rather than DOM-level: the server HTML contains the
 * fully-rendered result, so assertions don't depend on client hydration.
 *
 * Covers:
 *   A. Permission-set semantics (pure, no server)
 *   B. Page access matrix          (personas x routes)
 *   C. API route matrix            (personas x endpoints)
 *   D. Server actions              (invoked via the Next-Action protocol)
 *   E. Sidebar rendering           (entries present/absent per persona)
 *   F. Edge cases                  (deactivation, self-lockout, escalation, ...)
 *
 * Requires the app running on BASE_URL (default http://localhost:3000).
 *
 *   npx tsx scripts/test-scenarios.ts
 *
 * All fixtures are prefixed "ZZTest" and removed on exit, including after a
 * failure.
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { hashPassword } from "better-auth/crypto"
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import "dotenv/config"

import {
  createPermissionSet,
  expandRoleTemplate,
  MODULES,
  permissionKey,
  ROLE_TEMPLATES,
  type ModuleKey,
  type PermissionAction,
} from "../lib/permissions"
import { filterNavTree, NAV_TREE } from "../lib/navigation"
import { TXN_LABELS } from "../lib/labels"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const PW = "ZzTestPass123!"
const PREFIX = "ZZTest"
/** Emails are stored lower-case, so fixtures must match. */
const EPREFIX = PREFIX.toLowerCase()

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
})

// ============================================================
// Reporting
// ============================================================

interface Result {
  group: string
  name: string
  ok: boolean
  detail?: string
}

const results: Result[] = []

function check(group: string, name: string, ok: boolean, detail?: string) {
  results.push({ group, name, ok, detail })
  if (!ok) console.log(`    ✗ ${name}${detail ? ` — ${detail}` : ""}`)
}

function eq(group: string, name: string, actual: unknown, expected: unknown) {
  check(
    group,
    name,
    Object.is(actual, expected),
    Object.is(actual, expected) ? undefined : `expected ${expected}, got ${actual}`
  )
}

// ============================================================
// Personas
// ============================================================

type Grants = Partial<Record<ModuleKey, PermissionAction[]>>

interface Persona {
  key: string
  roleName: string
  email: string
  /** Explicit grants for a bespoke role. */
  grants?: Grants
  /** Copy the grants (and flags) of this built-in role template into a clone. */
  cloneOf?: string
  isActive?: boolean
  cookie?: string
  roleId?: string
  perms?: ReturnType<typeof createPermissionSet>
}

/**
 * Every persona gets its own throwaway role — a *clone* of the built-in
 * template rather than the built-in role itself. Tests here deliberately try to
 * edit and delete roles, and pointing them at the live Admin or Store Manager
 * row risks wiping real grants if a guard ever regresses.
 */
const PERSONAS: Persona[] = [
  { key: "admin", roleName: `${PREFIX} Admin`, email: `${EPREFIX}.admin@test.local`, cloneOf: "Admin" },
  { key: "manager", roleName: `${PREFIX} Store Manager`, email: `${EPREFIX}.manager@test.local`, cloneOf: "Store Manager" },
  { key: "clerk", roleName: `${PREFIX} Store Clerk`, email: `${EPREFIX}.clerk@test.local`, cloneOf: "Store Clerk" },
  { key: "auditor", roleName: `${PREFIX} Auditor`, email: `${EPREFIX}.auditor@test.local`, cloneOf: "Auditor" },
  {
    key: "grnonly",
    roleName: `${PREFIX} GrnOnly`,
    email: `${EPREFIX}.grnonly@test.local`,
    grants: {
      INWARD_RECORD: ["VIEW", "CREATE"],
      PRODUCT_MASTER: ["VIEW"],
      SUPPLIER_MASTER: ["VIEW"],
    },
  },
  {
    key: "empty",
    roleName: `${PREFIX} NoAccess`,
    email: `${EPREFIX}.empty@test.local`,
    grants: {},
  },
  {
    key: "inactive",
    roleName: `${PREFIX} Inactive`,
    email: `${EPREFIX}.inactive@test.local`,
    grants: { DASHBOARD: ["VIEW"], PRODUCT_MASTER: ["VIEW"] },
    isActive: true, // logged in first, then deactivated mid-run
  },
]

const byKey = (k: string) => PERSONAS.find((p) => p.key === k)!

// ============================================================
// HTTP helpers
// ============================================================

/**
 * Both Better Auth and Next.js server actions reject state-changing requests
 * without a matching `Origin` header (CSRF protection). Node's fetch omits it,
 * so every POST here has to set it explicitly.
 */
const ORIGIN_HEADERS = { Origin: BASE }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Better Auth rate-limits sign-in in production (it's disabled in dev), so a
 * harness that logs seven personas in back-to-back gets 429s. Back off and
 * retry rather than weakening the app's brute-force protection for tests.
 */
async function login(email: string, attempt = 0): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ORIGIN_HEADERS },
    body: JSON.stringify({ email, password: PW }),
    redirect: "manual",
  })

  if (res.status === 429 && attempt < 6) {
    const wait = Number(res.headers.get("x-retry-after")) * 1000 || 11_000
    await sleep(wait)
    return login(email, attempt + 1)
  }

  if (!res.ok) {
    console.log(`  ⚠ login ${email} -> ${res.status} ${(await res.text()).slice(0, 120)}`)
    return null
  }
  const raw = res.headers.getSetCookie?.() ?? []
  const cookie = raw.map((c) => c.split(";")[0]).join("; ")
  return cookie || null
}

interface PageResult {
  status: number
  location: string | null
  html: string
}

async function getPage(path: string, cookie?: string): Promise<PageResult> {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  })
  const html = res.status === 200 ? await res.text() : await res.text().catch(() => "")
  return { status: res.status, location: res.headers.get("location"), html }
}

const DENIED_MARKER = "have access to this section"

function pageVerdict(r: PageResult): "allowed" | "denied" | "login" | "error" {
  if (r.status === 307 || r.status === 302) {
    return r.location?.includes("/login") ? "login" : "allowed"
  }
  if (r.status !== 200) return "error"
  return r.html.includes(DENIED_MARKER) ? "denied" : "allowed"
}

// ============================================================
// Server action invocation
// ============================================================

/** Shape of each entry in Next's server-reference-manifest.json. */
interface ActionMeta {
  exportedName?: string
  filename?: string
}

/** filename::exportedName -> action id, harvested from the build manifests. */
const actionIds = new Map<string, string>()

function loadActionManifests(dir: string) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      loadActionManifests(full)
    } else if (entry === "server-reference-manifest.json") {
      try {
        const m: Record<string, Record<string, ActionMeta>> = JSON.parse(
          readFileSync(full, "utf8")
        )
        for (const runtime of ["node", "edge"]) {
          for (const [id, meta] of Object.entries(m[runtime] ?? {})) {
            if (meta?.exportedName && meta?.filename) {
              actionIds.set(`${meta.filename}::${meta.exportedName}`, id)
            }
          }
        }
      } catch {
        /* ignore malformed manifest */
      }
    }
  }
}

/**
 * Calls a server action the way the Next.js client does: POST to a page that
 * hosts it, with the action id in the `Next-Action` header and the arguments
 * as a JSON array (React's encoding for plain-serialisable args).
 */
async function callAction(
  file: string,
  name: string,
  page: string,
  args: unknown[],
  cookie?: string
): Promise<{ ok: boolean; body: string; status: number }> {
  const id = actionIds.get(`${file}::${name}`)
  if (!id) return { ok: false, body: `__NO_ACTION_ID__ ${file}::${name}`, status: 0 }

  const res = await fetch(`${BASE}${page}`, {
    method: "POST",
    headers: {
      "Next-Action": id,
      "Content-Type": "text/plain;charset=UTF-8",
      ...ORIGIN_HEADERS,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(args),
    redirect: "manual",
  })
  const body = await res.text().catch(() => "")
  return { ok: res.status < 400, body, status: res.status }
}

const denied = (body: string) =>
  /do not have permission|session has expired|Unauthorized|administrators can/i.test(body)

// ============================================================
// Fixtures
// ============================================================

const fixtures: { roleIds: string[]; userIds: string[]; supplierId?: string; productId?: string } = {
  roleIds: [],
  userIds: [],
}

async function setup() {
  console.log("Setting up fixtures...")
  await teardown(true)

  const perms = await prisma.permission.findMany()
  const permByKey = new Map(perms.map((p) => [permissionKey(p.module, p.action), p.id]))
  const passwordHash = await hashPassword(PW)

  for (const p of PERSONAS) {
    // Resolve this persona's grants: either an explicit set, or a copy of a
    // built-in template. Either way the role itself is a throwaway clone.
    let grantKeys: string[]
    let isSuperAdmin = false
    let isSystem = false

    if (p.cloneOf) {
      const template = ROLE_TEMPLATES.find((t) => t.name === p.cloneOf)
      if (!template) throw new Error(`No template named ${p.cloneOf}`)
      grantKeys = expandRoleTemplate(template).map((g) => permissionKey(g.module, g.action))
      isSuperAdmin = template.isSuperAdmin ?? false
      isSystem = template.isSystem ?? false
    } else {
      grantKeys = Object.entries(p.grants ?? {}).flatMap(([m, actions]) =>
        (actions as PermissionAction[]).map((a) => permissionKey(m, a))
      )
    }

    const role = await prisma.role.create({
      data: {
        name: p.roleName,
        description: "scenario harness fixture",
        isSuperAdmin,
        isSystem,
      },
    })
    fixtures.roleIds.push(role.id)
    const roleId = role.id
    p.roleId = roleId

    const ids = grantKeys.map((k) => permByKey.get(k)).filter((x): x is string => Boolean(x))
    if (ids.length)
      await prisma.rolePermission.createMany({
        data: ids.map((permissionId) => ({ roleId, permissionId })),
      })

    const user = await prisma.user.create({
      data: {
        email: p.email,
        name: `${PREFIX} ${p.key}`,
        roleId,
        isActive: true,
        emailVerified: true,
      },
    })
    fixtures.userIds.push(user.id)
    await prisma.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash },
    })

    // Build the in-process permission set for cross-checking expectations.
    p.perms = createPermissionSet({
      keys: grantKeys,
      isSuperAdmin,
      isAuthenticated: true,
    })
  }

  // Data fixtures for mutation tests.
  const sup = await prisma.supplier.create({ data: { name: `${PREFIX} Supplier`, isActive: true } })
  fixtures.supplierId = sup.id

  console.log(`  ${PERSONAS.length} personas, ${fixtures.roleIds.length} custom roles\n`)
}

async function teardown(quiet = false) {
  if (!quiet) console.log("\nCleaning up fixtures...")
  // Inventory fixtures first: store logs and purchase history reference the
  // product, and headers must go before the product they point at.
  const testProducts = await prisma.hardwareProduct.findMany({
    where: { description: { startsWith: PREFIX } },
    select: { id: true },
  })
  const productIds = testProducts.map((p) => p.id)
  if (productIds.length) {
    const grns = await prisma.grnHeader.findMany({
      where: { items: { some: { productId: { in: productIds } } } },
      select: { id: true, grnNumber: true },
    })
    const miss = await prisma.misHeader.findMany({
      where: { items: { some: { productId: { in: productIds } } } },
      select: { id: true, misNumber: true },
    })
    await prisma.storeLog.deleteMany({ where: { productId: { in: productIds } } })
    await prisma.purchaseHistory.deleteMany({ where: { productId: { in: productIds } } })
    await prisma.grnHeader.deleteMany({ where: { id: { in: grns.map((g) => g.id) } } })
    await prisma.misHeader.deleteMany({ where: { id: { in: miss.map((m) => m.id) } } })
    await prisma.binStock.deleteMany({ where: { productId: { in: productIds } } })
    await prisma.hardwareProduct.deleteMany({ where: { id: { in: productIds } } })
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: EPREFIX } } })
  await prisma.user.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.supplier.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.staff.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.bin.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX } } })
  // Clones carry isSystem/isSuperAdmin flags so the guards can be tested; the
  // app refuses to delete those, but the harness owns them, so remove directly.
  await prisma.role.deleteMany({ where: { name: { startsWith: PREFIX } } })
}

// ============================================================
// Route table
// ============================================================

const PAGES: { path: string; module: ModuleKey; action: PermissionAction }[] = [
  { path: "/dashboard", module: "DASHBOARD", action: "VIEW" },
  { path: "/inventory/grn", module: "INWARD_RECORD", action: "VIEW" },
  { path: "/inventory/grn/create", module: "INWARD_RECORD", action: "CREATE" },
  { path: "/inventory/mis", module: "OUTWARD_RECORD", action: "VIEW" },
  { path: "/inventory/mis/create", module: "OUTWARD_RECORD", action: "CREATE" },
  { path: "/inventory/store-log", module: "STORE_LOG", action: "VIEW" },
  { path: "/masters/products", module: "PRODUCT_MASTER", action: "VIEW" },
  { path: "/masters/products/create", module: "PRODUCT_MASTER", action: "CREATE" },
  { path: "/masters/categories", module: "CATEGORY_MASTER", action: "VIEW" },
  { path: "/masters/suppliers", module: "SUPPLIER_MASTER", action: "VIEW" },
  { path: "/masters/staff", module: "STAFF_MASTER", action: "VIEW" },
  { path: "/masters/units", module: "UNIT_MASTER", action: "VIEW" },
  { path: "/masters/attributes", module: "ATTRIBUTE_MASTER", action: "VIEW" },
  { path: "/masters/bins", module: "BIN_MASTER", action: "VIEW" },
  { path: "/reports", module: "REPORTS", action: "VIEW" },
  { path: "/reports/low-stock", module: "REPORTS", action: "VIEW" },
  { path: "/reports/stock-summary", module: "REPORTS", action: "VIEW" },
  { path: "/reports/purchase-history", module: "REPORTS", action: "VIEW" },
  { path: "/reports/supplier-wise", module: "REPORTS", action: "VIEW" },
  { path: "/reports/category-stock", module: "REPORTS", action: "VIEW" },
  { path: "/reports/consumption", module: "REPORTS", action: "VIEW" },
  { path: "/import-export", module: "DATA_TRANSFER", action: "VIEW" },
  { path: "/users", module: "USER_MANAGEMENT", action: "VIEW" },
]

const API_ROUTES: {
  path: string
  method: string
  needs: { module: ModuleKey; action: PermissionAction }[]
}[] = [
  {
    path: "/api/export/products",
    method: "GET",
    needs: [
      { module: "DATA_TRANSFER", action: "EXPORT" },
      { module: "PRODUCT_MASTER", action: "EXPORT" },
    ],
  },
  {
    path: "/api/export/store-log",
    method: "GET",
    needs: [
      { module: "DATA_TRANSFER", action: "EXPORT" },
      { module: "STORE_LOG", action: "EXPORT" },
    ],
  },
  {
    path: "/api/import/products",
    method: "POST",
    needs: [
      { module: "DATA_TRANSFER", action: "IMPORT" },
      { module: "PRODUCT_MASTER", action: "CREATE" },
    ],
  },
]

// ============================================================
// Phases
// ============================================================

function phaseA_permissionSemantics() {
  console.log("A. Permission-set semantics")
  const G = "A"

  const anon = createPermissionSet()
  check(G, "anon: no VIEW anywhere", !Object.keys(MODULES).some((m) => anon.canView(m as ModuleKey)))
  check(G, "anon: canAny false", !anon.canAny("INWARD_RECORD"))
  check(G, "anon: visibleModules empty", anon.visibleModules().length === 0)

  const superAdmin = createPermissionSet({ isSuperAdmin: true, isAuthenticated: true })
  check(G, "super: sees all modules", superAdmin.visibleModules().length === Object.keys(MODULES).length)
  check(G, "super: cannot hold undefined action (Staff IMPORT)", !superAdmin.can("STAFF_MASTER", "IMPORT"))
  check(G, "super: cannot hold undefined action (Dashboard DELETE)", !superAdmin.can("DASHBOARD", "DELETE"))
  check(G, "super: cannot hold undefined action (Categories EXPORT)", !superAdmin.can("CATEGORY_MASTER", "EXPORT"))

  // Not authenticated but holding keys must still deny (deactivated user path).
  const stale = createPermissionSet({
    keys: [permissionKey("INWARD_RECORD", "VIEW")],
    isAuthenticated: false,
  })
  check(G, "keys without auth are inert", !stale.can("INWARD_RECORD", "VIEW"))

  const staleSuper = createPermissionSet({ isSuperAdmin: true, isAuthenticated: false })
  check(G, "superAdmin without auth is inert", !staleSuper.can("USER_MANAGEMENT", "EDIT"))

  const one = createPermissionSet({
    keys: [permissionKey("PRODUCT_MASTER", "VIEW"), permissionKey("PRODUCT_MASTER", "EDIT")],
    isAuthenticated: true,
  })
  check(G, "granular: has EDIT", one.can("PRODUCT_MASTER", "EDIT"))
  check(G, "granular: lacks CREATE", !one.can("PRODUCT_MASTER", "CREATE"))
  check(G, "granular: lacks DELETE", !one.can("PRODUCT_MASTER", "DELETE"))
  check(G, "granular: canAll true for held pair", one.canAll("PRODUCT_MASTER", ["VIEW", "EDIT"]))
  check(G, "granular: canAll false when one missing", !one.canAll("PRODUCT_MASTER", ["VIEW", "DELETE"]))
  check(G, "granular: other module untouched", !one.canView("SUPPLIER_MASTER"))
  eq(G, "granular: actionsFor order", one.actionsFor("PRODUCT_MASTER").join(","), "VIEW,EDIT")

  // Every catalogue pair must round-trip.
  let roundTrip = true
  for (const [key, def] of Object.entries(MODULES)) {
    const ps = createPermissionSet({
      keys: def.actions.map((a) => permissionKey(key, a)),
      isAuthenticated: true,
    })
    if (ps.actionsFor(key as ModuleKey).length !== def.actions.length) roundTrip = false
  }
  check(G, "every module's full grant round-trips", roundTrip)

  // Nav filtering is driven by VIEW only.
  const viewOnlyGrn = createPermissionSet({
    keys: [permissionKey("INWARD_RECORD", "VIEW")],
    isAuthenticated: true,
  })
  const nav = filterNavTree(NAV_TREE, viewOnlyGrn)
  eq(G, "nav: single grant yields 1 group", nav.length, 1)
  eq(G, "nav: group is Inventory", nav[0]?.label, "Inventory")
  eq(G, "nav: group has 1 child", nav[0]?.children?.length, 1)
  eq(G, "nav: child is the inward entry", nav[0]?.children?.[0]?.label, TXN_LABELS.inward)

  const writeNoView = createPermissionSet({
    keys: [permissionKey("INWARD_RECORD", "CREATE")],
    isAuthenticated: true,
  })
  check(G, "nav: CREATE without VIEW hides the entry", filterNavTree(NAV_TREE, writeNoView).length === 0)
  check(G, "anon nav is empty", filterNavTree(NAV_TREE, anon).length === 0)
  check(
    G,
    "super nav shows every leaf",
    filterNavTree(NAV_TREE, superAdmin).reduce(
      (n, i) => n + (i.children ? i.children.length : 1),
      0
    ) === Object.keys(MODULES).length
  )
  console.log(`   ${results.filter((r) => r.group === G).length} checks\n`)
}

async function phaseB_pageMatrix() {
  console.log("B. Page access matrix")
  const G = "B"

  for (const p of PERSONAS) {
    if (p.key === "inactive") continue
    for (const page of PAGES) {
      const r = await getPage(page.path, p.cookie)
      const expected = p.perms!.can(page.module, page.action) ? "allowed" : "denied"
      const actual = pageVerdict(r)
      check(
        G,
        `${p.key} ${page.path}`,
        actual === expected,
        actual === expected ? undefined : `expected ${expected}, got ${actual} (status ${r.status})`
      )
    }
  }

  // Unauthenticated must never reach a page.
  for (const page of PAGES.slice(0, 8)) {
    const r = await getPage(page.path)
    check(G, `anon ${page.path} -> login`, pageVerdict(r) === "login", `got ${pageVerdict(r)}`)
  }

  console.log(`   ${results.filter((r) => r.group === G).length} checks\n`)
}

async function phaseC_apiMatrix() {
  console.log("C. API route matrix")
  const G = "C"

  for (const p of PERSONAS) {
    if (p.key === "inactive") continue
    for (const route of API_ROUTES) {
      const allowed = route.needs.every((n) => p.perms!.can(n.module, n.action))
      const res = await fetch(`${BASE}${route.path}`, {
        method: route.method,
        headers: { ...ORIGIN_HEADERS, ...(p.cookie ? { cookie: p.cookie } : {}) },
        redirect: "manual",
      })
      // Import with no body legitimately 400s once authorised.
      const ok = allowed ? res.status !== 401 && res.status !== 403 : res.status === 403
      check(G, `${p.key} ${route.method} ${route.path}`, ok, `status ${res.status}, expected ${allowed ? "authorised" : "403"}`)
    }
  }

  for (const route of API_ROUTES) {
    const res = await fetch(`${BASE}${route.path}`, {
      method: route.method,
      headers: ORIGIN_HEADERS,
      redirect: "manual",
    })
    eq(G, `anon ${route.path} -> 401`, res.status, 401)
  }

  console.log(`   ${results.filter((r) => r.group === G).length} checks\n`)
}

async function phaseD_serverActions() {
  console.log("D. Server actions")
  const G = "D"

  const S = "app/(dashboard)/masters/suppliers/actions.ts"
  const GRN = "app/(dashboard)/inventory/grn/actions.ts"
  const U = "app/(dashboard)/users/actions.ts"
  const P = "app/(dashboard)/masters/products/actions.ts"
  const SL = "app/(dashboard)/inventory/store-log/actions.ts"

  if (actionIds.size === 0) {
    check(G, "action manifests loaded", false, "no server-reference-manifest.json found")
    return
  }
  check(G, "action manifests loaded", true)

  // --- reads must not leak to unauthorised callers ---
  for (const p of PERSONAS) {
    if (p.key === "inactive") continue
    const res = await callAction(S, "getSuppliers", "/masters/suppliers", [], p.cookie)
    const canView = p.perms!.canView("SUPPLIER_MASTER")
    const leaked = res.body.includes(`${PREFIX} Supplier`)
    check(G, `${p.key} getSuppliers ${canView ? "returns" : "withholds"} data`, canView ? leaked : !leaked)
  }

  // --- getUsers must never leak account emails to non-admins ---
  for (const p of PERSONAS) {
    if (p.key === "inactive") continue
    const res = await callAction(U, "getUsers", "/users", [], p.cookie)
    const canView = p.perms!.canView("USER_MANAGEMENT")
    const leaked = res.body.includes("@test.local")
    check(G, `${p.key} getUsers ${canView ? "returns" : "withholds"} accounts`, canView ? leaked : !leaked)
  }

  // --- writes gated on CREATE/EDIT/DELETE ---
  for (const p of PERSONAS) {
    if (p.key === "inactive") continue

    // Positive outcomes are asserted by side effect rather than by scanning the
    // response: a successful action returns the re-rendered page as an RSC
    // flight payload, which is far too large to string-match reliably.
    const madeName = `${PREFIX} Made By ${p.key}`
    await callAction(S, "saveSupplier", "/masters/suppliers", [{ name: madeName, isActive: true }], p.cookie)
    const canCreate = p.perms!.can("SUPPLIER_MASTER", "CREATE")
    const made = await prisma.supplier.findFirst({ where: { name: madeName } })
    check(
      G,
      `${p.key} saveSupplier ${canCreate ? "creates the row" : "creates nothing"}`,
      canCreate ? !!made : !made
    )

    await callAction(S, "deleteSupplier", "/masters/suppliers", [fixtures.supplierId], p.cookie)
    const canDelete = p.perms!.can("SUPPLIER_MASTER", "DELETE")
    const target = await prisma.supplier.findUniqueOrThrow({ where: { id: fixtures.supplierId! } })
    check(
      G,
      `${p.key} deleteSupplier ${canDelete ? "deactivates" : "leaves it active"}`,
      canDelete ? !target.isActive : target.isActive
    )
    if (canDelete) {
      await prisma.supplier.update({ where: { id: fixtures.supplierId! }, data: { isActive: true } })
    }
  }

  // --- deleteGrn: the action that previously had no check at all ---
  for (const p of PERSONAS) {
    if (p.key === "inactive") continue
    const res = await callAction(GRN, "deleteGrn", "/inventory/grn", ["nonexistent-id", "test"], p.cookie)
    const canDelete = p.perms!.can("INWARD_RECORD", "DELETE")
    // Authorised callers get past the guard and fail on the missing record.
    check(
      G,
      `${p.key} deleteGrn ${canDelete ? "passes guard" : "blocked"}`,
      canDelete ? !denied(res.body) : denied(res.body),
      res.body.slice(0, 90)
    )
  }

  for (const p of PERSONAS) {
    if (p.key === "inactive") continue
    const res = await callAction(GRN, "hardDeleteGrn", "/inventory/grn", ["nonexistent-id"], p.cookie)
    const canDelete = p.perms!.can("INWARD_RECORD", "DELETE")
    check(G, `${p.key} hardDeleteGrn ${canDelete ? "passes guard" : "blocked"}`, canDelete ? !denied(res.body) : denied(res.body))
  }

  for (const p of PERSONAS) {
    if (p.key === "inactive") continue
    const res = await callAction(SL, "hardDeleteStoreLog", "/inventory/store-log", ["nonexistent"], p.cookie)
    const can = p.perms!.can("STORE_LOG", "DELETE")
    check(G, `${p.key} hardDeleteStoreLog ${can ? "passes guard" : "blocked"}`, can ? !denied(res.body) : denied(res.body))
  }

  for (const p of PERSONAS) {
    if (p.key === "inactive") continue
    const res = await callAction(P, "deleteProduct", "/masters/products", ["nonexistent", false], p.cookie)
    const can = p.perms!.can("PRODUCT_MASTER", "DELETE")
    check(G, `${p.key} deleteProduct ${can ? "passes guard" : "blocked"}`, can ? !denied(res.body) : denied(res.body))
  }

  // --- role management ---
  for (const p of PERSONAS) {
    if (p.key === "inactive") continue
    const roleName = `${PREFIX} Injected ${p.key}`
    await callAction(U, "saveRole", "/users", [{ name: roleName, description: "", permissionIds: [] }], p.cookie)
    const can = p.perms!.can("USER_MANAGEMENT", "CREATE")
    const injected = await prisma.role.findFirst({ where: { name: roleName } })
    check(G, `${p.key} saveRole ${can ? "creates the role" : "creates nothing"}`, can ? !!injected : !injected)
  }

  console.log(`   ${results.filter((r) => r.group === G).length} checks\n`)
}

async function phaseE_sidebar() {
  console.log("E. Sidebar rendering")
  const G = "E"

  // The sidebar renders collapsed on the server (`collapsed` starts true so it
  // doesn't flash open on mobile), and a group's children are gated on
  // `open && !collapsed`. So server HTML only ever contains the *top-level*
  // entries plus the group headers. Assert exactly that here; the per-leaf
  // filtering is covered against the real `filterNavTree` in phase A.
  const TOP_LEVEL: ModuleKey[] = ["DASHBOARD", "REPORTS", "DATA_TRANSFER", "USER_MANAGEMENT"]
  const GROUPS: { label: string; members: ModuleKey[] }[] = [
    { label: "Inventory", members: ["INWARD_RECORD", "OUTWARD_RECORD", "STORE_LOG"] },
    {
      label: "Masters",
      members: [
        "PRODUCT_MASTER",
        "CATEGORY_MASTER",
        "SUPPLIER_MASTER",
        "STAFF_MASTER",
        "UNIT_MASTER",
        "ATTRIBUTE_MASTER",
        "BIN_MASTER",
      ],
    },
  ]

  for (const p of PERSONAS) {
    if (p.key === "inactive") continue
    const landing =
      p.perms!.canView("DASHBOARD") ? "/dashboard" : p.perms!.visibleModules()[0]?.route ?? "/no-access"
    const { html } = await getPage(landing, p.cookie)

    for (const key of TOP_LEVEL) {
      const shouldSee = p.perms!.canView(key)
      const present = html.includes(`href="${MODULES[key].route}"`)
      check(
        G,
        `${p.key} nav ${shouldSee ? "shows" : "hides"} ${MODULES[key].label}`,
        present === shouldSee,
        present === shouldSee ? undefined : `href=${MODULES[key].route} present=${present}`
      )
    }

    for (const group of GROUPS) {
      const shouldSee = group.members.some((m) => p.perms!.canView(m))
      // Collapsed, the header button renders its label only as a tooltip.
      const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"))
      const present =
        nav.includes(`title="${group.label}"`) || nav.includes(`>${group.label}</span>`)
      check(
        G,
        `${p.key} nav ${shouldSee ? "shows" : "hides"} the ${group.label} group`,
        present === shouldSee,
        present === shouldSee ? undefined : `present=${present}`
      )
    }
  }
  console.log(`   ${results.filter((r) => r.group === G).length} checks\n`)
}

async function phaseF_edgeCases() {
  console.log("F. Edge cases")
  const G = "F"

  // --- landing redirect goes somewhere the role can actually open ---
  for (const p of PERSONAS) {
    if (p.key === "inactive") continue
    const r = await getPage("/", p.cookie)
    const target = r.location ?? ""
    if (p.key === "empty") {
      check(G, "empty role lands on /no-access", target.includes("/no-access"), `got ${target}`)
    } else if (p.perms!.canView("DASHBOARD")) {
      check(G, `${p.key} lands on /dashboard`, target.includes("/dashboard"), `got ${target}`)
    } else {
      const first = p.perms!.visibleModules()[0]
      check(G, `${p.key} lands on first visible section`, target.includes(first?.route ?? "?"), `got ${target}`)
    }
  }

  // --- /no-access is reachable when signed in, not when anonymous ---
  const na = await getPage("/no-access", byKey("empty").cookie)
  eq(G, "/no-access renders for signed-in user", na.status, 200)
  const naAnon = await getPage("/no-access")
  check(G, "/no-access redirects anonymous", pageVerdict(naAnon) === "login")

  // --- denied pages must not leak the data they guard ---
  // Checks for *other* accounts specifically: a page legitimately knows who is
  // viewing it, so the viewer's own address is not a leak.
  const usersDenied = await getPage("/users", byKey("clerk").cookie)
  const otherEmails = PERSONAS.filter((x) => x.key !== "clerk").map((x) => x.email)
  const leaked = otherEmails.filter((e) => usersDenied.html.includes(e))
  check(G, "denied /users leaks no other accounts", leaked.length === 0, leaked.join(", "))
  const supDenied = await getPage("/masters/suppliers", byKey("empty").cookie)
  check(G, "denied /suppliers leaks no supplier names", !supDenied.html.includes(`${PREFIX} Supplier`))

  // --- removed backdoor stays removed ---
  const setup = await fetch(`${BASE}/api/setup-admin`, { redirect: "manual" })
  eq(G, "/api/setup-admin is gone", setup.status, 404)

  // --- deactivation takes effect on the *existing* session ---
  const inactive = byKey("inactive")
  const before = await getPage("/dashboard", inactive.cookie)
  check(G, "active user reaches dashboard", pageVerdict(before) === "allowed", `got ${pageVerdict(before)}`)
  await prisma.user.updateMany({ where: { email: inactive.email }, data: { isActive: false } })
  const after = await getPage("/dashboard", inactive.cookie)
  check(
    G,
    "deactivated user is locked out on the same cookie",
    pageVerdict(after) === "login",
    `got ${pageVerdict(after)} (status ${after.status})`
  )
  const afterApi = await fetch(`${BASE}/api/export/products`, {
    headers: { cookie: inactive.cookie! },
    redirect: "manual",
  })
  eq(G, "deactivated user rejected by API", afterApi.status, 401)
  await prisma.user.updateMany({ where: { email: inactive.email }, data: { isActive: true } })

  // --- privilege escalation: non-super-admin cannot hand out the super role ---
  const U = "app/(dashboard)/users/actions.ts"
  // The super-admin/built-in guards are exercised against the harness's own
  // clone, never the live Admin row — if a guard ever regresses, the blast
  // radius is a throwaway fixture instead of the real administrator role.
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: `${PREFIX} Admin` } })
  const escalationRole = await prisma.role.findFirst({ where: { name: `${PREFIX} GrnOnly` } })

  // Give a persona USER_MANAGEMENT rights but not super-admin, then try.
  const perms = await prisma.permission.findMany({ where: { module: "USER_MANAGEMENT" } })
  await prisma.rolePermission.createMany({
    data: perms.map((p) => ({ roleId: escalationRole!.id, permissionId: p.id })),
    skipDuplicates: true,
  })
  const esc = byKey("grnonly")
  esc.cookie = (await login(esc.email)) ?? esc.cookie

  const escalate = await callAction(
    U,
    "saveUser",
    "/users",
    [
      {
        name: `${PREFIX} Escalated`,
        email: `${EPREFIX}.escalated@test.local`,
        roleId: adminRole.id,
        isActive: true,
        password: PW,
      },
    ],
    esc.cookie
  )
  check(
    G,
    "non-super-admin cannot assign the Admin role",
    denied(escalate.body) || /Only an administrator/i.test(escalate.body),
    escalate.body.slice(0, 120)
  )
  const escalated = await prisma.user.findFirst({ where: { email: `${EPREFIX}.escalated@test.local` } })
  check(G, "escalated account was not created", !escalated)

  // --- editing the super-admin role is refused ---
  const editSuper = await callAction(
    U,
    "saveRole",
    "/users",
    [{ id: adminRole.id, name: "Admin", description: "hijack", permissionIds: [] }],
    esc.cookie
  )
  check(
    G,
    "super-admin role cannot be edited",
    /cannot be edited|do not have permission/i.test(editSuper.body),
    editSuper.body.slice(0, 120)
  )
  const stillSuper = await prisma.role.findUniqueOrThrow({ where: { id: adminRole.id } })
  check(G, "super-admin role still super after attempt", stillSuper.isSuperAdmin)

  // --- self-lockout guard ---
  const selfLock = await callAction(
    U,
    "saveRole",
    "/users",
    [{ id: escalationRole!.id, name: `${PREFIX} GrnOnly`, description: "", permissionIds: [] }],
    esc.cookie
  )
  check(
    G,
    "cannot strip Users&Roles from your own role",
    /lock yourself out/i.test(selfLock.body),
    selfLock.body.slice(0, 120)
  )

  // --- built-in roles cannot be deleted ---
  const delBuiltIn = await callAction(U, "deleteRole", "/users", [adminRole.id], esc.cookie)
  check(G, "built-in role cannot be deleted", /built-in|do not have permission/i.test(delBuiltIn.body), delBuiltIn.body.slice(0, 120))

  // --- an account created through the UI must actually be able to sign in ---
  // Regression: Better Auth lower-cases the address at sign-in, so storing a
  // mixed-case email verbatim produced an account nobody could ever log into.
  const mixed = `${PREFIX}.MixedCase@Test.Local`
  await callAction(
    U,
    "saveUser",
    "/users",
    [
      {
        name: `${PREFIX} Mixed`,
        email: mixed,
        roleId: (await prisma.role.findFirstOrThrow({ where: { name: `${PREFIX} Store Clerk` } })).id,
        isActive: true,
        password: PW,
      },
    ],
    byKey("admin").cookie
  )
  const storedMixed = await prisma.user.findFirst({ where: { email: mixed.toLowerCase() } })
  check(G, "admin can create a user with a mixed-case email", !!storedMixed)
  check(G, "mixed-case email is stored lower-cased", !!storedMixed, "not found lower-cased")
  const mixedCookie = await login(mixed.toLowerCase())
  check(G, "user created with mixed-case email can sign in", !!mixedCookie)
  if (mixedCookie) {
    const dash = await getPage("/dashboard", mixedCookie)
    check(G, "that user reaches their dashboard", pageVerdict(dash) === "allowed", `got ${pageVerdict(dash)}`)
  }

  // Creating the same address in a different case must be caught as a duplicate.
  const dupe = await callAction(
    U,
    "saveUser",
    "/users",
    [
      {
        name: `${PREFIX} Dupe`,
        email: mixed.toUpperCase(),
        roleId: (await prisma.role.findFirstOrThrow({ where: { name: `${PREFIX} Store Clerk` } })).id,
        isActive: true,
        password: PW,
      },
    ],
    byKey("admin").cookie
  )
  check(G, "same email in a different case is rejected as duplicate", /already exists/i.test(dupe.body), dupe.body.slice(0, 100))

  // --- self-deactivation guard ---
  const escUser = await prisma.user.findFirstOrThrow({ where: { email: esc.email } })
  const selfOff = await callAction(
    U,
    "saveUser",
    "/users",
    [{ id: escUser.id, name: escUser.name, email: escUser.email, roleId: escUser.roleId, isActive: false }],
    esc.cookie
  )
  check(G, "cannot deactivate your own account", /deactivate your own/i.test(selfOff.body), selfOff.body.slice(0, 120))

  console.log(`   ${results.filter((r) => r.group === G).length} checks\n`)
}

async function phaseG_inventoryFlow() {
  console.log("G. Inventory flow")
  const G = "G"

  const GRN = "app/(dashboard)/inventory/grn/actions.ts"
  const MIS = "app/(dashboard)/inventory/mis/actions.ts"
  const P = "app/(dashboard)/masters/products/actions.ts"

  const admin = byKey("admin")
  const manager = byKey("manager")

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
  const unit = await prisma.unit.findFirstOrThrow({ where: { isActive: true } })
  const bin = await prisma.bin.findFirstOrThrow({ where: { isActive: true } })
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: fixtures.supplierId! } })

  // ---- product creation, with auto SKU ----
  const desc = `${PREFIX} Widget`
  await callAction(
    P,
    "saveProduct",
    "/masters/products",
    [
      {
        description: desc,
        categoryId: category.id,
        unitId: unit.id,
        sku: "",
        minStock: 5,
        openingStock: 0,
        isActive: true,
        aliases: [],
        attributes: [],
        defaultBinId: bin.id,
      },
    ],
    admin.cookie
  )
  const product = await prisma.hardwareProduct.findFirst({ where: { description: desc } })
  check(G, "product created via action", !!product)
  if (!product) {
    console.log(`   ${results.filter((r) => r.group === G).length} checks\n`)
    return
  }
  fixtures.productId = product.id
  check(G, "SKU auto-generated when left blank", !!product.sku && product.sku.length > 2, product.sku)
  eq(G, "opening stock respected", product.currentStock, 0)

  // ---- GRN increases stock and writes the audit trail ----
  await callAction(
    GRN,
    "saveGrn",
    "/inventory/grn",
    [
      {
        supplierId: supplier.id,
        invoiceNumber: `${PREFIX}-INV-1`,
        items: [
          {
            productId: product.id,
            quantity: 2,
            baseQuantity: 20,
            purchaseUnitName: "Box (10)",
            conversionFactor: 10,
            rate: 15,
            binId: bin.id,
          },
        ],
      },
    ],
    manager.cookie
  )

  const grn = await prisma.grnHeader.findFirst({
    where: { invoiceNumber: `${PREFIX}-INV-1` },
    include: { items: true, createdBy: true },
  })
  check(G, "GRN created", !!grn)
  if (grn) {
    const afterGrn = await prisma.hardwareProduct.findUniqueOrThrow({ where: { id: product.id } })
    eq(G, "GRN adds base quantity to stock", afterGrn.currentStock, 20)
    eq(G, "last purchase rate recorded", afterGrn.lastPurchaseRate, 15)
    eq(G, "last supplier recorded", afterGrn.lastSupplierId, supplier.id)

    // Regression: createdById used to be taken from the client, and fell back
    // to a synthetic "System" account.
    eq(G, "GRN attributed to the acting user", grn.createdBy.email, manager.email)

    const log = await prisma.storeLog.findFirst({
      where: { referenceNumber: grn.grnNumber, transactionType: "GRN" },
    })
    check(G, "GRN writes a store log entry", !!log)
    eq(G, "store log quantity matches base qty", log?.quantity, 20)
    eq(G, "store log balance matches stock", log?.balanceAfter, 20)
    eq(G, "store log attributed to acting user", log?.createdById, grn.createdById)

    const ph = await prisma.purchaseHistory.findFirst({ where: { productId: product.id } })
    check(G, "GRN writes purchase history", !!ph)
    eq(G, "purchase history rate", ph?.rate, 15)

    const binStock = await prisma.binStock.findFirst({
      where: { productId: product.id, binId: bin.id },
    })
    eq(G, "bin stock incremented", binStock?.quantity, 20)
  }

  // ---- MIS reduces stock ----
  await callAction(
    MIS,
    "saveMis",
    "/inventory/mis",
    [
      {
        recipientType: "MANUFACTURING",
        purpose: `${PREFIX} consumption`,
        items: [{ productId: product.id, quantity: 5, binId: bin.id }],
      },
    ],
    manager.cookie
  )
  const mis = await prisma.misHeader.findFirst({
    where: { purpose: `${PREFIX} consumption` },
    include: { createdBy: true },
  })
  check(G, "MIS created", !!mis)
  if (mis) {
    const afterMis = await prisma.hardwareProduct.findUniqueOrThrow({ where: { id: product.id } })
    eq(G, "MIS deducts from stock", afterMis.currentStock, 15)
    eq(G, "MIS attributed to the acting user", mis.createdBy.email, manager.email)
    const misLog = await prisma.storeLog.findFirst({
      where: { referenceNumber: mis.misNumber, transactionType: "MIS" },
    })
    check(G, "MIS writes a store log entry", !!misLog)
    eq(G, "MIS store log is negative", misLog?.quantity, -5)
  }

  // ---- MIS beyond available stock must be refused ----
  const before = await prisma.hardwareProduct.findUniqueOrThrow({ where: { id: product.id } })
  await callAction(
    MIS,
    "saveMis",
    "/inventory/mis",
    [
      {
        recipientType: "MANUFACTURING",
        purpose: `${PREFIX} overdraw`,
        items: [{ productId: product.id, quantity: 9999 }],
      },
    ],
    manager.cookie
  )
  const overdraw = await prisma.misHeader.findFirst({ where: { purpose: `${PREFIX} overdraw` } })
  check(G, "MIS beyond stock is rejected", !overdraw)
  const afterOverdraw = await prisma.hardwareProduct.findUniqueOrThrow({ where: { id: product.id } })
  eq(G, "stock unchanged after refused MIS", afterOverdraw.currentStock, before.currentStock)

  // ---- voiding a GRN reverses its stock ----
  if (grn) {
    await callAction(GRN, "deleteGrn", "/inventory/grn", [grn.id, "scenario test"], manager.cookie)
    const voided = await prisma.grnHeader.findUniqueOrThrow({ where: { id: grn.id } })
    check(G, "GRN marked deleted", voided.isDeleted)
    eq(G, "delete reason stored", voided.deleteReason, "scenario test")
    const afterVoid = await prisma.hardwareProduct.findUniqueOrThrow({ where: { id: product.id } })
    eq(G, "voiding a GRN reverses its stock", afterVoid.currentStock, 15 - 20)
    const adj = await prisma.storeLog.findFirst({
      where: { referenceNumber: `DEL-${grn.grnNumber}`, transactionType: "ADJUSTMENT" },
    })
    check(G, "void writes a reversal entry", !!adj)
  }

  console.log(`   ${results.filter((r) => r.group === G).length} checks\n`)
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`\n🧪 RBAC scenario harness against ${BASE}\n`)

  loadActionManifests(".next/dev/server/app")
  loadActionManifests(".next/server/app")
  console.log(`Loaded ${actionIds.size} server action ids\n`)

  await setup()

  for (const p of PERSONAS) {
    p.cookie = (await login(p.email)) ?? undefined
    if (!p.cookie) console.log(`  ⚠ could not sign in as ${p.key}`)
  }

  phaseA_permissionSemantics()
  await phaseB_pageMatrix()
  await phaseC_apiMatrix()
  await phaseD_serverActions()
  await phaseE_sidebar()
  await phaseF_edgeCases()
  await phaseG_inventoryFlow()

  // ---- report ----
  const failed = results.filter((r) => !r.ok)
  const groups = [...new Set(results.map((r) => r.group))]
  console.log("=".repeat(64))
  for (const g of groups) {
    const rs = results.filter((r) => r.group === g)
    const bad = rs.filter((r) => !r.ok).length
    console.log(`  ${g}: ${rs.length - bad}/${rs.length} passed${bad ? `  (${bad} FAILED)` : ""}`)
  }
  console.log("=".repeat(64))
  console.log(`  TOTAL: ${results.length - failed.length}/${results.length} scenarios passed`)

  if (failed.length) {
    console.log(`\n❌ ${failed.length} failing scenario(s):\n`)
    for (const f of failed) console.log(`  [${f.group}] ${f.name}${f.detail ? `\n        ${f.detail}` : ""}`)
  } else {
    console.log("\n✅ All scenarios passed.")
  }
  console.log("")

  process.exitCode = failed.length ? 1 : 0
}

main()
  .catch((e) => {
    console.error("Harness crashed:", e)
    process.exitCode = 1
  })
  .finally(async () => {
    await teardown()
    await prisma.$disconnect()
  })
