/**
 * Unit checks for lib/client-cache.ts against a stand-in localStorage.
 *
 *   npx tsx scripts/verify-client-cache.ts
 *
 * The store is small but it decides two things worth pinning down: whether one
 * user can ever read another's cached lists on a shared terminal, and whether a
 * full or unavailable localStorage degrades quietly instead of taking the app
 * down with it. Both are awkward to reach through a browser and trivial here.
 *
 * The module keeps process-wide state (a parsed mirror, and a flag that gives up
 * on persistence after a write fails), so the "localStorage throws on access"
 * case runs in a child process — it would otherwise poison every check after it.
 */

import { spawnSync } from "node:child_process"

const PHASE = process.env.CACHE_TEST_PHASE ?? "main"

/** localStorage key prefix used by the module under test. */
const NAMESPACE = "hwerp.c1"
const keyFor = (key: string) => `${NAMESPACE}.${key}`

/** Minimal Storage that can be told to reject writes, the way a full quota does. */
class FakeStorage implements Storage {
  private map = new Map<string, string>()
  /** Set to make every setItem throw, as browsers do at the quota. */
  full = false
  writeAttempts = 0

  get length(): number {
    return this.map.size
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.writeAttempts++
    if (this.full) {
      const err = new Error("QuotaExceededError")
      err.name = "QuotaExceededError"
      throw err
    }
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  clear(): void {
    this.map.clear()
  }
  keys(): string[] {
    return [...this.map.keys()]
  }
}

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

function report(): never {
  console.log(`\n${"=".repeat(56)}`)
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log(`${"=".repeat(56)}\n`)
  process.exit(failed === 0 ? 0 : 1)
}

// ============================================================
// Child phase: localStorage throws the moment it is touched
// ============================================================

async function runNoStoragePhase(): Promise<never> {
  Object.defineProperty(globalThis, "localStorage", {
    get() {
      throw new Error("SecurityError: localStorage is disabled")
    },
    configurable: true,
  })

  const cache = await import("../lib/client-cache")

  console.log("\nNo storage available")
  let broke = false
  try {
    cache.setCacheScope("user-h")
    cache.writeCache("lookup.units", [{ id: "u1" }], "1.1")
    const read = cache.readCache<{ id: string }[]>("lookup.units")
    broke = read?.data[0]?.id !== "u1"
  } catch {
    broke = true
  }
  check(
    "works from memory when localStorage is unavailable",
    !broke,
    "some private-browsing modes throw on access"
  )
  check("purgeCache is survivable without storage", (() => {
    try {
      cache.purgeCache()
      return true
    } catch {
      return false
    }
  })())

  report()
}

// ============================================================
// Main phase
// ============================================================

async function runMainPhase(): Promise<never> {
  const store = new FakeStorage()
  // Installed before importing the module, which reads globalThis.localStorage
  // lazily on first use.
  Object.defineProperty(globalThis, "localStorage", {
    value: store,
    configurable: true,
    writable: true,
  })

  const cache = await import("../lib/client-cache")

  console.log("\n🔍 client cache unit checks\n")

  // ---- round trip ----
  console.log("Round trip")
  cache.setCacheScope("user-a")
  cache.writeCache("lookup.units", [{ id: "u1", name: "Kilogram" }], "1.100")

  const hit = cache.readCache<{ id: string; name: string }[]>("lookup.units")
  check("value survives a write/read", hit?.data[0]?.name === "Kilogram")
  check("revision is preserved", hit?.revision === "1.100", hit?.revision)
  check(
    "second read returns the identical object",
    cache.readCache("lookup.units") === hit,
    "useSyncExternalStore loops forever on a fresh reference each render"
  )
  check(
    "entry is persisted, not just held in memory",
    store.getItem(keyFor("lookup.units")) !== null
  )

  // ---- freshness ----
  console.log("\nFreshness")
  check("a just-written entry is fresh", cache.isFresh(hit, 60_000))
  check("a zero-TTL entry is never fresh", !cache.isFresh(hit, 0))
  check("a missing entry is not fresh", !cache.isFresh(null, 60_000))
  check(
    "an entry stamped in the future is treated as stale",
    !cache.isFresh({ data: [], writtenAt: Date.now() + 3_600_000, revision: "x" }, 60_000),
    "a clock that moved backwards must not pin an entry forever"
  )

  // ---- scope isolation ----
  console.log("\nScope isolation")
  cache.setCacheScope("user-b")
  check(
    "a different user cannot read the first user's entry",
    cache.readCache("lookup.units") === null
  )
  check(
    "the first user's entry is gone from storage, not merely hidden",
    store.getItem(keyFor("lookup.units")) === null
  )

  cache.writeCache("lookup.units", [{ id: "u2", name: "Metre" }], "1.200")
  cache.setCacheScope("user-a")
  check(
    "switching back does not resurrect the earlier entry either",
    cache.readCache("lookup.units") === null,
    "a scope change purges rather than partitions"
  )

  // ---- version isolation ----
  // Written straight to storage under a key this process has never read, so the
  // read path has to go to storage rather than the parsed mirror.
  console.log("\nVersion isolation")
  store.setItem(
    keyFor("lookup.fromNewerDeploy"),
    JSON.stringify({
      v: cache.CACHE_SCHEMA_VERSION + 1,
      s: "user-a",
      t: Date.now(),
      r: "1.1",
      d: [{ id: "x" }],
    })
  )
  check(
    "an entry written by a newer schema version is not served",
    cache.readCache("lookup.fromNewerDeploy") === null
  )
  check(
    "and it is evicted rather than left to be re-checked",
    store.getItem(keyFor("lookup.fromNewerDeploy")) === null
  )

  store.setItem(
    keyFor("lookup.fromOtherUser"),
    JSON.stringify({
      v: cache.CACHE_SCHEMA_VERSION,
      s: "somebody-else",
      t: Date.now(),
      r: "1.1",
      d: [{ id: "secret" }],
    })
  )
  check(
    "an entry stamped with another user is not served",
    cache.readCache("lookup.fromOtherUser") === null,
    "the per-entry scope check backs up the purge"
  )

  // ---- corrupt data ----
  console.log("\nCorrupt data")
  store.setItem(keyFor("lookup.brokenJson"), "{ not json")
  check("unparsable entry reads as a miss", cache.readCache("lookup.brokenJson") === null)
  check("unparsable entry is evicted", store.getItem(keyFor("lookup.brokenJson")) === null)

  store.setItem(keyFor("lookup.wrongShape"), JSON.stringify({ hello: "world" }))
  check(
    "entry with the wrong shape reads as a miss",
    cache.readCache("lookup.wrongShape") === null
  )

  // ---- invalidation ----
  console.log("\nInvalidation")
  cache.writeCache("lookup.products", [1, 2, 3], "3.400")
  check("entry present before invalidation", cache.readCache("lookup.products") !== null)
  cache.dropCache("lookup.products")
  check("dropCache removes it", cache.readCache("lookup.products") === null)
  check(
    "dropCache removes it from storage too",
    store.getItem(keyFor("lookup.products")) === null
  )

  cache.writeCache("lookup.a", [1], "1.1")
  cache.writeCache("lookup.b", [2], "1.1")
  cache.purgeCache()
  check(
    "purgeCache clears every entry",
    cache.readCache("lookup.a") === null && cache.readCache("lookup.b") === null
  )
  check(
    "purgeCache clears storage",
    store.keys().filter((k) => k.startsWith(`${NAMESPACE}.lookup`)).length === 0,
    JSON.stringify(store.keys())
  )

  // A write after a purge must be visible; the mirror's "known miss" entries
  // have to be replaced, not kept.
  cache.writeCache("lookup.a", [9], "9.9")
  check("a write after a purge is visible", cache.readCache<number[]>("lookup.a")?.data[0] === 9)

  // ---- quota exhaustion ----
  console.log("\nQuota exhaustion")
  store.full = true
  store.writeAttempts = 0

  let threw = false
  try {
    cache.writeCache("lookup.big", [{ id: "p1" }], "2.200")
  } catch {
    threw = true
  }
  check("a full quota does not throw at the caller", !threw)
  check(
    "the value is still readable after a failed write",
    cache.readCache<{ id: string }[]>("lookup.big")?.data[0]?.id === "p1",
    "the cache degrades to in-memory rather than losing data"
  )
  check(
    "a failed write is retried once after purging, then given up on",
    store.writeAttempts === 2,
    `${store.writeAttempts} attempts`
  )

  store.writeAttempts = 0
  cache.writeCache("lookup.another", [{ id: "c1" }], "1.1")
  check(
    "persistence is not attempted again once it has failed",
    store.writeAttempts === 0,
    `${store.writeAttempts} attempts`
  )

  // ---- the child phase ----
  // Re-runs this file with whatever loader flags tsx gave us, so the child can
  // start from a clean module state.
  const child = spawnSync(
    process.execPath,
    [...process.execArgv, process.argv[1]],
    {
      env: { ...process.env, CACHE_TEST_PHASE: "nostore" },
      encoding: "utf8",
    }
  )
  process.stdout.write(child.stdout ?? "")
  if (child.status !== 0) {
    console.log(child.stderr ?? "")
    failed++
  } else {
    // The child prints its own tally; fold it in so the totals are honest.
    const m = /(\d+) passed, (\d+) failed/.exec(child.stdout ?? "")
    if (m) {
      passed += Number(m[1])
      failed += Number(m[2])
    }
  }

  report()
}

// Not top-level await: tsx compiles this file to CJS, which does not allow it.
const phase = PHASE === "nostore" ? runNoStoragePhase() : runMainPhase()
phase.catch((err) => {
  console.error(err)
  process.exit(1)
})
