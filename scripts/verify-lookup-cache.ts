/**
 * Verifies the lookup cache end to end against a running production server.
 *
 *   npx next build && npx next start -p 3100
 *   BASE_URL=http://localhost:3100 npx tsx scripts/verify-lookup-cache.ts
 *
 * What it proves, in order:
 *
 *  1. The reference lists are gone from the create pages' payloads — that is the
 *     bandwidth win, and the only part that cannot be seen from the client.
 *  2. `fetchLookups` returns rows plus a revision, and `fetchLookupRevisions`
 *     returns the *same* revision, which is what lets a warm cache skip the
 *     refetch. The probe also has to be much smaller than the rows, or checking
 *     would cost as much as fetching.
 *  3. A mutation moves the revision, so a stale cache is detected.
 *  4. Lists a role may not read are withheld rather than returned empty-shaped,
 *     since the cache is only as safe as this gate.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
// Must come before lib/prisma, which reads DATABASE_URL as it builds the client.
import "dotenv/config"
import { hashPassword } from "better-auth/crypto"

import { prisma } from "../lib/prisma"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const PW = process.env.ADMIN_PASSWORD ?? "AdminPassword123!"
const ORIGIN_HEADERS = { Origin: BASE }

const LOOKUP_ACTIONS = "lib/lookups/actions.ts"

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`)
  } else {
    failed++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ============================================================
// Plumbing (same protocol the browser uses)
// ============================================================

const actionIds = new Map<string, string>()

interface ActionMeta {
  exportedName?: string
  filename?: string
}

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
        /* malformed manifest */
      }
    }
  }
}

async function login(email: string, attempt = 0): Promise<string | null> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ORIGIN_HEADERS },
    body: JSON.stringify({ email, password: PW }),
    redirect: "manual",
  })

  // Sign-in is rate limited in production builds.
  if (res.status === 429 && attempt < 6) {
    const wait = Number(res.headers.get("x-retry-after")) * 1000 || 11_000
    await sleep(wait)
    return login(email, attempt + 1)
  }
  if (!res.ok) {
    console.log(`  ⚠ login ${email} -> ${res.status} ${(await res.text()).slice(0, 160)}`)
    return null
  }
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ")
  return cookie || null
}

/** Calls a server action the way the Next.js client does. */
async function callAction(
  name: string,
  page: string,
  args: unknown[],
  cookie: string
): Promise<{ status: number; body: string }> {
  const id = actionIds.get(`${LOOKUP_ACTIONS}::${name}`)
  if (!id) return { status: 0, body: `__NO_ACTION_ID__ ${name}` }

  const res = await fetch(`${BASE}${page}`, {
    method: "POST",
    headers: {
      "Next-Action": id,
      "Content-Type": "text/plain;charset=UTF-8",
      ...ORIGIN_HEADERS,
      cookie,
    },
    body: JSON.stringify(args),
  })
  return { status: res.status, body: await res.text() }
}

async function getPage(path: string, cookie: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" })
  return { status: res.status, html: await res.text() }
}

/**
 * Pulls the action's return value out of the RSC flight response.
 *
 * The payload is line-oriented; the returned value is the one row that parses as
 * the shape we asked for, so this looks for it rather than assuming a position.
 */
function findInFlight<T>(body: string, predicate: (value: unknown) => boolean): T | null {
  for (const line of body.split("\n")) {
    const colon = line.indexOf(":")
    if (colon === -1) continue
    const json = line.slice(colon + 1)
    try {
      const parsed: unknown = JSON.parse(json)
      if (predicate(parsed)) return parsed as T
    } catch {
      /* not a JSON row */
    }
  }
  return null
}

interface LookupResultish {
  kind: string
  revision: string
  rows: unknown[]
}

function isLookupResults(value: unknown): value is LookupResultish[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as LookupResultish).kind === "string" &&
        typeof (v as LookupResultish).revision === "string" &&
        Array.isArray((v as LookupResultish).rows)
    )
  )
}

function isRevisionMap(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const entries = Object.entries(value)
  return (
    entries.length > 0 && entries.every(([, v]) => typeof v === "string" && /^\d+\./.test(v))
  )
}

/**
 * Runs `body` as a throwaway user whose role grants only DASHBOARD:VIEW, then
 * removes both. A clone rather than a real role, so a bug in here can never
 * disturb the grants an actual user depends on.
 */
async function withMinimalPersona(body: (cookie: string) => Promise<void>): Promise<void> {
  const suffix = Date.now()
  const email = `cache-probe-${suffix}@example.invalid`

  const role = await prisma.role.create({
    data: {
      name: `__cache-probe-${suffix}`,
      description: "lookup cache verification fixture",
      isSuperAdmin: false,
      isSystem: false,
    },
  })
  let userId: string | null = null

  try {
    const dashboardView = await prisma.permission.findFirst({
      where: { module: "DASHBOARD", action: "VIEW" },
      select: { id: true },
    })
    if (dashboardView) {
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: dashboardView.id },
      })
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: "Cache probe",
        roleId: role.id,
        isActive: true,
        emailVerified: true,
      },
    })
    userId = user.id
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await hashPassword(PW),
      },
    })

    const cookie = await login(email)
    if (!cookie) {
      console.log("  ⊘ could not sign in as the probe user (skipped)")
      return
    }
    await body(cookie)
  } finally {
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } })
      await prisma.account.deleteMany({ where: { userId } })
      await prisma.user.delete({ where: { id: userId } })
    }
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
    await prisma.role.delete({ where: { id: role.id } })
  }
}

// ============================================================
// Checks
// ============================================================

async function main() {
  console.log(`\n🔍 Lookup cache verification against ${BASE}\n`)

  loadActionManifests(".next/server/app")
  loadActionManifests(".next/dev/server/app")
  check(
    "lookup action ids found in build manifest",
    actionIds.has(`${LOOKUP_ACTIONS}::fetchLookups`) &&
      actionIds.has(`${LOOKUP_ACTIONS}::fetchLookupRevisions`)
  )

  const admin = await prisma.user.findFirst({
    where: { role: { isSuperAdmin: true }, isActive: true },
    select: { email: true },
  })
  if (!admin) {
    console.log("\n✗ no active super admin to sign in as\n")
    process.exit(1)
  }

  const cookie = await login(admin.email)
  if (!cookie) {
    console.log("\n✗ could not sign in; set ADMIN_PASSWORD if it is not the default\n")
    process.exit(1)
  }
  console.log(`  signed in as ${admin.email}\n`)

  // ---- 1. the lists are no longer in the page payloads ----
  console.log("1. Create pages no longer carry the reference lists")

  const [someProduct, someSupplier, someStaff] = await Promise.all([
    prisma.hardwareProduct.findFirst({ where: { isActive: true }, select: { sku: true } }),
    prisma.supplier.findFirst({ where: { isActive: true }, select: { name: true } }),
    prisma.staff.findFirst({ where: { isActive: true }, select: { name: true } }),
  ])

  const grnCreate = await getPage("/inventory/grn/create", cookie)
  check("सामान आया create page renders", grnCreate.status === 200)
  if (someProduct) {
    check(
      "product SKUs absent from सामान आया create payload",
      !grnCreate.html.includes(someProduct.sku),
      `looked for ${someProduct.sku}`
    )
  }
  if (someSupplier) {
    check(
      "supplier names absent from सामान आया create payload",
      !grnCreate.html.includes(someSupplier.name),
      `looked for ${JSON.stringify(someSupplier.name)}`
    )
  }

  const misCreate = await getPage("/inventory/mis/create", cookie)
  check("सामान दिया create page renders", misCreate.status === 200)
  if (someStaff) {
    check(
      "staff names absent from सामान दिया create payload",
      !misCreate.html.includes(someStaff.name),
      `looked for ${JSON.stringify(someStaff.name)}`
    )
  }

  const productCreate = await getPage("/masters/products/create", cookie)
  check("product create page renders", productCreate.status === 200)

  console.log(
    `  page sizes: सामान आया ${(grnCreate.html.length / 1024).toFixed(1)} KB, ` +
      `सामान दिया ${(misCreate.html.length / 1024).toFixed(1)} KB, ` +
      `product ${(productCreate.html.length / 1024).toFixed(1)} KB\n`
  )

  // ---- 2. rows and revisions agree, and the probe is cheap ----
  console.log("2. Rows and revision probe")

  const kinds = ["suppliers", "bins", "products", "categories", "units", "staff", "attributes"]

  const rowsRes = await callAction("fetchLookups", "/inventory/grn/create", [kinds], cookie)
  check("fetchLookups returns 200", rowsRes.status === 200, `status ${rowsRes.status}`)

  const results = findInFlight<LookupResultish[]>(rowsRes.body, isLookupResults)
  check("fetchLookups returns one result per kind", results?.length === kinds.length,
    results ? `${results.length}/${kinds.length}` : "no parsable result")

  const byKind = new Map((results ?? []).map((r) => [r.kind, r]))
  check(
    "every list carries a revision",
    (results ?? []).length > 0 && (results ?? []).every((r) => r.revision.length > 0)
  )

  const dbProductCount = await prisma.hardwareProduct.count({ where: { isActive: true } })
  check(
    "product rows match the database",
    byKind.get("products")?.rows.length === dbProductCount,
    `${byKind.get("products")?.rows.length} vs ${dbProductCount} active`
  )

  const revRes = await callAction(
    "fetchLookupRevisions",
    "/inventory/grn/create",
    [kinds],
    cookie
  )
  check("fetchLookupRevisions returns 200", revRes.status === 200)

  const revisions = findInFlight<Record<string, string>>(revRes.body, isRevisionMap)
  check("revision probe covers every kind", Object.keys(revisions ?? {}).length === kinds.length,
    `${Object.keys(revisions ?? {}).length}/${kinds.length}`)

  const allMatch =
    revisions !== null &&
    [...byKind.values()].every((r) => revisions[r.kind] === r.revision)
  check("probe revisions match the ones the rows were tagged with", allMatch)

  // This ratio is the whole point: a warm cache pays the small number.
  const ratio = rowsRes.body.length / Math.max(revRes.body.length, 1)
  check(
    "revision probe is much smaller than the rows",
    ratio > 2,
    `rows ${(rowsRes.body.length / 1024).toFixed(1)} KB vs probe ` +
      `${(revRes.body.length / 1024).toFixed(1)} KB (${ratio.toFixed(1)}x)`
  )

  // ---- 3. a change moves the revision ----
  console.log("\n3. A change is detected")

  const before = revisions?.bins
  const probe = await prisma.bin.create({
    data: { name: `__cache-probe-${Date.now()}`, isActive: true },
  })
  try {
    const after = findInFlight<Record<string, string>>(
      (await callAction("fetchLookupRevisions", "/inventory/grn/create", [["bins"]], cookie))
        .body,
      isRevisionMap
    )
    check(
      "creating a bin moves the bins revision",
      Boolean(before) && after?.bins !== before,
      `${before} -> ${after?.bins}`
    )
  } finally {
    await prisma.bin.delete({ where: { id: probe.id } })
  }

  // ---- 4. unknown kinds and permission gates ----
  console.log("\n4. Input validation and permission gates")

  const junk = await callAction(
    "fetchLookups",
    "/inventory/grn/create",
    [["products", "products", "users", "__proto__", 42, null]],
    cookie
  )
  const junkResults = findInFlight<LookupResultish[]>(junk.body, isLookupResults)
  check(
    "unknown kinds dropped and duplicates collapsed",
    junkResults?.length === 1 && junkResults[0].kind === "products",
    `got ${JSON.stringify((junkResults ?? []).map((r) => r.kind))}`
  )

  // A user holding nothing but the dashboard must not be able to pull the master
  // lists out of the cache endpoint, however it asks. Built on a throwaway role
  // rather than a live one so nothing here can damage real grants.
  await withMinimalPersona(async (personaCookie) => {
    for (const kind of ["suppliers", "staff", "products", "categories"]) {
      const res = await callAction(
        "fetchLookups",
        "/inventory/grn/create",
        [[kind]],
        personaCookie
      )
      const got = findInFlight<LookupResultish[]>(res.body, isLookupResults)
      check(
        `dashboard-only user gets no ${kind} list`,
        !(got ?? []).some((r) => r.kind === kind),
        `status ${res.status}`
      )
    }

    const revRes = await callAction(
      "fetchLookupRevisions",
      "/inventory/grn/create",
      [["suppliers", "products"]],
      personaCookie
    )
    check(
      "dashboard-only user gets no revisions either",
      findInFlight<Record<string, string>>(revRes.body, isRevisionMap) === null,
      `status ${revRes.status}`
    )
  })

  // ---- 5. this script cleaned up after itself ----
  console.log("\n5. No fixture residue")

  const [probeRoles, probeUsers, probeBins] = await Promise.all([
    prisma.role.count({ where: { name: { contains: "cache-probe" } } }),
    prisma.user.count({ where: { email: { contains: "cache-probe" } } }),
    prisma.bin.count({ where: { name: { contains: "cache-probe" } } }),
  ])
  check("no probe roles left", probeRoles === 0, `${probeRoles}`)
  check("no probe users left", probeUsers === 0, `${probeUsers}`)
  check("no probe bins left", probeBins === 0, `${probeBins}`)

  // The built-in roles were wiped once by a harness bug, so their grant counts
  // are worth re-asserting after anything that touches roles.
  const builtIns = await prisma.role.findMany({
    where: { name: { in: ["Admin", "Store Manager", "Auditor", "Store Clerk"] } },
    select: { name: true, _count: { select: { permissions: true } } },
  })
  const counts = Object.fromEntries(builtIns.map((r) => [r.name, r._count.permissions]))
  check(
    "built-in roles still hold their grants",
    counts["Admin"] === 53 &&
      counts["Store Manager"] === 40 &&
      counts["Auditor"] === 20 &&
      counts["Store Clerk"] === 12,
    JSON.stringify(counts)
  )

  console.log(`\n${"=".repeat(56)}`)
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log(`${"=".repeat(56)}\n`)

  await prisma.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
