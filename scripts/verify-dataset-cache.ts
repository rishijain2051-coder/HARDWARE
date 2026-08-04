/**
 * Verifies the browser data cache end to end against a running production server.
 *
 *   npx next build && npx next start -p 3100
 *   BASE_URL=http://localhost:3100 npx tsx scripts/verify-dataset-cache.ts
 *
 * What it proves, in order:
 *
 *  1. The data is gone from the page payloads — that is the bandwidth win, and
 *     the only part that cannot be seen from the client.
 *  2. `fetchDatasets` returns data plus a revision, and `fetchDatasetRevisions`
 *     returns the *same* revision, which is what lets a warm cache skip the
 *     refetch. The probe also has to be much smaller than the data, or checking
 *     would cost as much as fetching.
 *  3. A mutation moves the revision, so a stale cache is detected.
 *  4. The permission gates hold — including the split that makes the whole design
 *     safe: a clerk who can book stock may read supplier *names* but not supplier
 *     contact details.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
// Must come before lib/prisma, which reads DATABASE_URL as it builds the client.
import "dotenv/config"
import { hashPassword } from "better-auth/crypto"

import { prisma } from "../lib/prisma"
import { DATASET_KINDS } from "../lib/datasets/types"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const PW = process.env.ADMIN_PASSWORD ?? "AdminPassword123!"
const ORIGIN_HEADERS = { Origin: BASE }

const DATASET_ACTIONS = "lib/datasets/actions.ts"

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
  const id = actionIds.get(`${DATASET_ACTIONS}::${name}`)
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
 * The payload is line-oriented; the returned value is the one row that satisfies
 * the predicate, so this looks for it rather than assuming a position.
 */
function findInFlight<T>(body: string, predicate: (value: unknown) => boolean): T | null {
  for (const line of body.split("\n")) {
    const colon = line.indexOf(":")
    if (colon === -1) continue
    try {
      const parsed: unknown = JSON.parse(line.slice(colon + 1))
      if (predicate(parsed)) return parsed as T
    } catch {
      /* not a JSON row */
    }
  }
  return null
}

interface DatasetResultish {
  kind: string
  revision: string
  data: unknown
}

function isDatasetResults(value: unknown): value is DatasetResultish[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as DatasetResultish).kind === "string" &&
        typeof (v as DatasetResultish).revision === "string" &&
        "data" in (v as DatasetResultish)
    )
  )
}

function isRevisionMap(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const entries = Object.entries(value)
  return entries.length > 0 && entries.every(([, v]) => typeof v === "string" && /^\d/.test(v))
}

/**
 * Runs `body` as a throwaway user with exactly the grants given, then removes both
 * the user and the role. Clones rather than live roles, so a bug in here can never
 * disturb the grants an actual user depends on.
 */
async function withPersona(
  label: string,
  grants: [string, string][],
  body: (cookie: string) => Promise<void>
): Promise<void> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const email = `cache-probe-${suffix}@example.invalid`

  const role = await prisma.role.create({
    data: {
      name: `__cache-probe-${suffix}`,
      description: `dataset cache verification fixture (${label})`,
      isSuperAdmin: false,
      isSystem: false,
    },
  })
  let userId: string | null = null

  try {
    for (const [module, action] of grants) {
      const permission = await prisma.permission.findFirst({
        where: { module, action },
        select: { id: true },
      })
      if (permission) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id },
        })
      }
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: `Cache probe ${label}`,
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
      console.log(`  ⊘ could not sign in as the ${label} probe (skipped)`)
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

/** The kinds actually returned for a request, or [] if none were. */
async function kindsReturned(
  kinds: string[],
  page: string,
  cookie: string
): Promise<string[]> {
  const res = await callAction("fetchDatasets", page, [kinds], cookie)
  const results = findInFlight<DatasetResultish[]>(res.body, isDatasetResults)
  return (results ?? []).map((r) => r.kind)
}

// ============================================================
// Checks
// ============================================================

async function main() {
  console.log(`\n🔍 Dataset cache verification against ${BASE}\n`)

  loadActionManifests(".next/server/app")
  loadActionManifests(".next/dev/server/app")
  check(
    "dataset action ids found in build manifest",
    actionIds.has(`${DATASET_ACTIONS}::fetchDatasets`) &&
      actionIds.has(`${DATASET_ACTIONS}::fetchDatasetRevisions`)
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

  // ---- 1. the data is no longer in the page payloads ----
  console.log("1. Pages no longer carry their data")

  const [someProduct, someSupplier, someStaff, someCategory, someBin, someGrn, someLog] =
    await Promise.all([
      prisma.hardwareProduct.findFirst({ where: { isActive: true }, select: { sku: true } }),
      prisma.supplier.findFirst({ select: { name: true } }),
      prisma.staff.findFirst({ select: { name: true } }),
      prisma.category.findFirst({ select: { name: true } }),
      prisma.bin.findFirst({ select: { name: true } }),
      prisma.grnHeader.findFirst({
        where: { isDeleted: false },
        select: { grnNumber: true },
      }),
      prisma.storeLog.findFirst({ select: { referenceNumber: true } }),
    ])

  const pages: { path: string; label: string; needle: string | null | undefined }[] = [
    { path: "/dashboard", label: "dashboard", needle: someGrn?.grnNumber },
    { path: "/inventory/grn/create", label: "सामान आया create", needle: someProduct?.sku },
    { path: "/inventory/mis/create", label: "सामान दिया create", needle: someStaff?.name },
    { path: "/masters/products/create", label: "product create", needle: someCategory?.name },
    { path: "/masters/products", label: "products list", needle: someProduct?.sku },
    { path: "/masters/suppliers", label: "suppliers list", needle: someSupplier?.name },
    { path: "/masters/staff", label: "staff list", needle: someStaff?.name },
    { path: "/masters/categories", label: "categories list", needle: someCategory?.name },
    { path: "/masters/bins", label: "bins list", needle: someBin?.name },
    { path: "/inventory/grn", label: "सामान आया list", needle: someGrn?.grnNumber },
    { path: "/inventory/store-log", label: "store log", needle: someLog?.referenceNumber },
  ]

  let totalBytes = 0
  for (const page of pages) {
    const res = await getPage(page.path, cookie)
    totalBytes += res.html.length
    check(`${page.label} renders`, res.status === 200, `status ${res.status}`)
    if (page.needle) {
      check(
        `${page.label} payload carries no data`,
        !res.html.includes(page.needle),
        `looked for ${JSON.stringify(page.needle)}`
      )
    }
  }
  console.log(
    `  ${pages.length} pages, ${(totalBytes / 1024).toFixed(0)} KB total ` +
      `(~${(totalBytes / 1024 / pages.length).toFixed(0)} KB each — shells only)\n`
  )

  // ---- 2. data and revisions agree, and the probe is cheap ----
  console.log("2. Data and revision probe")

  const kinds = [...DATASET_KINDS]

  const dataRes = await callAction("fetchDatasets", "/dashboard", [kinds], cookie)
  check("fetchDatasets returns 200", dataRes.status === 200, `status ${dataRes.status}`)

  const results = findInFlight<DatasetResultish[]>(dataRes.body, isDatasetResults)
  check(
    "fetchDatasets returns one result per kind",
    results?.length === kinds.length,
    results ? `${results.length}/${kinds.length}` : "no parsable result"
  )

  const byKind = new Map((results ?? []).map((r) => [r.kind, r]))
  check(
    "every dataset carries a revision",
    (results ?? []).length > 0 && (results ?? []).every((r) => r.revision.length > 0)
  )

  const [dbActive, dbAll] = await Promise.all([
    prisma.hardwareProduct.count({ where: { isActive: true } }),
    prisma.hardwareProduct.count(),
  ])
  const activeCount = (byKind.get("products")?.data as unknown[] | undefined)?.length
  const allCount = (byKind.get("productRows")?.data as unknown[] | undefined)?.length
  check(
    "the reference list holds only active products",
    activeCount === dbActive,
    `${activeCount} vs ${dbActive} active`
  )
  check(
    "the master table holds every product, deactivated included",
    allCount === dbAll,
    `${allCount} vs ${dbAll} total`
  )

  const dashboard = byKind.get("dashboard")?.data as Record<string, unknown> | undefined
  check(
    "the dashboard comes back as a stats object, not a list",
    !!dashboard && !Array.isArray(dashboard) && typeof dashboard.totalProducts === "number",
    `totalProducts=${JSON.stringify(dashboard?.totalProducts)}`
  )

  const revRes = await callAction("fetchDatasetRevisions", "/dashboard", [kinds], cookie)
  check("fetchDatasetRevisions returns 200", revRes.status === 200)

  const revisions = findInFlight<Record<string, string>>(revRes.body, isRevisionMap)
  check(
    "revision probe covers every kind",
    Object.keys(revisions ?? {}).length === kinds.length,
    `${Object.keys(revisions ?? {}).length}/${kinds.length}`
  )
  check(
    "probe revisions match the ones the data was tagged with",
    revisions !== null && [...byKind.values()].every((r) => revisions[r.kind] === r.revision)
  )

  // This ratio is the whole point: a warm cache pays the small number.
  const ratio = dataRes.body.length / Math.max(revRes.body.length, 1)
  check(
    "revision probe is much smaller than the data",
    ratio > 2,
    `data ${(dataRes.body.length / 1024).toFixed(1)} KB vs probe ` +
      `${(revRes.body.length / 1024).toFixed(1)} KB (${ratio.toFixed(1)}x)`
  )

  // ---- 3. changes are detected ----
  console.log("\n3. Changes are detected")

  const probe = await prisma.bin.create({
    data: { name: `__cache-probe-${Date.now()}`, isActive: true },
  })
  try {
    const after = findInFlight<Record<string, string>>(
      (
        await callAction(
          "fetchDatasetRevisions",
          "/dashboard",
          [["bins", "binRows"]],
          cookie
        )
      ).body,
      isRevisionMap
    )
    check(
      "creating a bin moves the bins revision",
      after?.bins !== undefined && after.bins !== revisions?.bins,
      `${revisions?.bins} -> ${after?.bins}`
    )
    check(
      "and the binRows revision with it",
      after?.binRows !== undefined && after.binRows !== revisions?.binRows,
      `${revisions?.binRows} -> ${after?.binRows}`
    )
  } finally {
    await prisma.bin.delete({ where: { id: probe.id } })
  }

  /*
   * The joined-name case. The products table shows a unit abbreviation beside
   * each SKU, so renaming a unit changes what that screen displays without
   * touching a single product row. A revision derived from `hardwareProduct`
   * alone would not move, and the cached table would keep showing the old name.
   */
  const someUnit = await prisma.unit.findFirst({ select: { id: true, name: true } })
  if (!someUnit) {
    console.log("  ⊘ no unit to rename (skipped)")
  } else {
    const before = revisions?.productRows
    await prisma.unit.update({
      where: { id: someUnit.id },
      data: { name: `${someUnit.name} ` },
    })
    try {
      const after = findInFlight<Record<string, string>>(
        (await callAction("fetchDatasetRevisions", "/dashboard", [["productRows"]], cookie))
          .body,
        isRevisionMap
      )
      check(
        "renaming a unit moves the productRows revision",
        after?.productRows !== undefined && after.productRows !== before,
        `the product table joins the unit name into every row`
      )
    } finally {
      await prisma.unit.update({
        where: { id: someUnit.id },
        data: { name: someUnit.name },
      })
    }
  }

  // ---- 4. input validation and permission gates ----
  console.log("\n4. Input validation and permission gates")

  const junk = await kindsReturned(
    ["productRows", "productRows", "users", "__proto__", "roles"],
    "/dashboard",
    cookie
  )
  check(
    "unknown kinds dropped and duplicates collapsed",
    junk.length === 1 && junk[0] === "productRows",
    `got ${JSON.stringify(junk)}`
  )

  await withPersona("dashboard-only", [["DASHBOARD", "VIEW"]], async (personaCookie) => {
    const got = await kindsReturned(
      kinds.filter((k) => k !== "dashboard"),
      "/dashboard",
      personaCookie
    )
    check(
      "a dashboard-only user gets no other dataset at all",
      got.length === 0,
      `got ${JSON.stringify(got)}`
    )

    const probeRes = await callAction(
      "fetchDatasetRevisions",
      "/dashboard",
      [["supplierRows", "productRows"]],
      personaCookie
    )
    check(
      "and no revisions for them either",
      findInFlight(probeRes.body, isRevisionMap) === null,
      `status ${probeRes.status}`
    )
  })

  /*
   * The split that makes this design safe. A clerk who books incoming stock must
   * be able to pick a supplier by name, so "suppliers" is readable. The master
   * table behind /masters/suppliers carries phone numbers, addresses and GST
   * numbers, so "supplierRows" must not be — through the very same endpoint.
   */
  await withPersona(
    "inward-clerk",
    [
      ["INWARD_RECORD", "VIEW"],
      ["INWARD_RECORD", "CREATE"],
    ],
    async (personaCookie) => {
      const got = await kindsReturned(
        ["suppliers", "supplierRows", "products", "productRows", "grnList", "storeLog"],
        "/inventory/grn/create",
        personaCookie
      )

      check(
        "an inward clerk can read supplier names",
        got.includes("suppliers"),
        `got ${JSON.stringify(got)}`
      )
      check(
        "but not supplier contact details",
        !got.includes("supplierRows"),
        "supplierRows requires SUPPLIER_MASTER:VIEW"
      )
      check("can read the product list a form needs", got.includes("products"))
      check(
        "but not the full product master",
        !got.includes("productRows"),
        "productRows requires PRODUCT_MASTER:VIEW"
      )
      check("can read the सामान आया list they may view", got.includes("grnList"))
      check(
        "but not the store log ledger",
        !got.includes("storeLog"),
        "storeLog requires STORE_LOG:VIEW"
      )

      /*
       * Belt and braces: the contact details must be absent from the response
       * body, not merely from the list of kinds.
       *
       * A supplier is created here rather than borrowed from the database,
       * because the real rows carry names only — a scan for details that are all
       * null would pass no matter what the endpoint returned.
       */
      const stamp = Date.now()
      const secret = {
        phone: `999000${stamp % 100000}`,
        email: `probe-${stamp}@example.invalid`,
        gst: `GSTPROBE${stamp}`,
        contactPerson: `Probe Contact ${stamp}`,
      }
      const probeSupplier = await prisma.supplier.create({
        data: { name: `__cache-probe supplier ${stamp}`, isActive: true, ...secret },
      })

      try {
        const res = await callAction(
          "fetchDatasets",
          "/inventory/grn/create",
          [["suppliers", "supplierRows"]],
          personaCookie
        )
        const leaked = Object.entries(secret).filter(([, v]) => res.body.includes(v))
        check(
          "no supplier contact detail anywhere in the response body",
          leaked.length === 0,
          leaked.length
            ? `leaked ${JSON.stringify(leaked.map(([k]) => k))}`
            : "checked phone, email, gst, contactPerson"
        )
        // The name still has to come through, or the check above would be passing
        // for the wrong reason.
        check(
          "the supplier name does come through",
          res.body.includes(probeSupplier.name),
          "so the check above is not passing on an empty response"
        )
      } finally {
        await prisma.supplier.delete({ where: { id: probeSupplier.id } })
      }
    }
  )

  // ---- 5. this script cleaned up after itself ----
  console.log("\n5. No fixture residue")

  const [probeRoles, probeUsers, probeBins, probeSuppliers] = await Promise.all([
    prisma.role.count({ where: { name: { contains: "cache-probe" } } }),
    prisma.user.count({ where: { email: { contains: "cache-probe" } } }),
    prisma.bin.count({ where: { name: { contains: "cache-probe" } } }),
    prisma.supplier.count({ where: { name: { contains: "cache-probe" } } }),
  ])
  check("no probe roles left", probeRoles === 0, `${probeRoles}`)
  check("no probe users left", probeUsers === 0, `${probeUsers}`)
  check("no probe bins left", probeBins === 0, `${probeBins}`)
  check("no probe suppliers left", probeSuppliers === 0, `${probeSuppliers}`)

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
