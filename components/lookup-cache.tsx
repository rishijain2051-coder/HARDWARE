"use client"

import { useEffect, useSyncExternalStore } from "react"

import {
  dropCache,
  isFresh,
  readCache,
  setCacheScope,
  useCacheEntry,
  writeCache,
} from "@/lib/client-cache"
import { fetchLookupRevisions, fetchLookups } from "@/lib/lookups/actions"
import {
  LOOKUP_TTL_MS,
  lookupCacheKey,
  type LookupKind,
  type LookupPayloads,
} from "@/lib/lookups/types"

/**
 * Client half of the lookup cache.
 *
 * The reference lists every entry screen needs used to travel in the RSC
 * payload of each page, so walking from the सामान आया list to the create form
 * re-downloaded the whole product master. Now the page ships without them and
 * `useLookup` serves them from localStorage:
 *
 *   fresh cache  -> rendered immediately, zero requests
 *   stale cache  -> rendered immediately, one cheap revision probe in the
 *                   background, rows refetched only if something changed
 *   cold cache   -> one batched fetch
 *
 * Requests made by every `useLookup` in a tree are coalesced into a single
 * action call, so a form asking for suppliers, bins and products costs one
 * round trip rather than three.
 */

// ============================================================
// Request status
// ============================================================

interface LookupStatus {
  /** True only while there is nothing cached to show. */
  loading: boolean
  error: string | null
}

const IDLE: LookupStatus = { loading: false, error: null }
const LOADING: LookupStatus = { loading: true, error: null }
const FAILED: LookupStatus = {
  loading: false,
  error: "Could not load the list. Check your connection and try again.",
}

const statuses = new Map<LookupKind, LookupStatus>()
const statusListeners = new Set<() => void>()

/**
 * Unresolved counts as loading.
 *
 * On a full page load the cache cannot be read until after hydration, so for one
 * frame a list has no rows and no request has started yet. Reporting that as idle
 * paints an empty, clickable dropdown that looks like "there are no suppliers";
 * reporting it as loading paints a disabled one, which is what is actually
 * happening. Client-side navigations skip this entirely — they read the cache
 * during render and never see either state.
 */
function getStatus(kind: LookupKind): LookupStatus {
  return statuses.get(kind) ?? LOADING
}

function setStatus(kind: LookupKind, next: LookupStatus): void {
  if (getStatus(kind) === next) return
  statuses.set(kind, next)
  for (const listener of statusListeners) listener()
}

function subscribeStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

// ============================================================
// Request coordination
// ============================================================

const wantRows = new Set<LookupKind>()
const wantRevision = new Set<LookupKind>()
const inFlight = new Set<LookupKind>()

/**
 * Kinds the server declined to return. Memory-only and intentionally not
 * persisted: a role change should take effect on the next page load rather than
 * leaving a user staring at empty dropdowns until a TTL expires.
 */
const withheld = new Set<LookupKind>()

/**
 * Bumped by `invalidateLookups`. A response tagged with an older generation is
 * discarded — otherwise a revision probe already in flight when the user saves a
 * new product could land afterwards and overwrite the fresh list with the one
 * from before the save.
 */
let generation = 0
let flushScheduled = false

function request(kind: LookupKind): void {
  if (inFlight.has(kind) || withheld.has(kind)) return

  const entry = readCache(lookupCacheKey(kind))
  if (isFresh(entry, LOOKUP_TTL_MS[kind])) return

  if (entry) wantRevision.add(kind)
  else wantRows.add(kind)

  if (flushScheduled) return
  flushScheduled = true
  // A microtask, so every useLookup effect in this commit lands in one batch.
  void Promise.resolve().then(flush)
}

function flush(): void {
  flushScheduled = false

  const rowKinds = [...wantRows].filter((k) => !inFlight.has(k))
  const revisionKinds = [...wantRevision].filter((k) => !inFlight.has(k))
  wantRows.clear()
  wantRevision.clear()

  if (rowKinds.length > 0) void loadRows(rowKinds)
  if (revisionKinds.length > 0) void checkRevisions(revisionKinds)
}

async function loadRows(kinds: LookupKind[]): Promise<void> {
  const gen = generation
  for (const kind of kinds) {
    inFlight.add(kind)
    // Only announce loading when there is nothing on screen yet; a refresh of
    // an already-rendered list should be invisible.
    if (!readCache(lookupCacheKey(kind))) setStatus(kind, LOADING)
  }

  try {
    const results = await fetchLookups(kinds)
    if (gen !== generation) return

    const returned = new Set<LookupKind>()
    for (const result of results) {
      writeCache(lookupCacheKey(result.kind), result.rows, result.revision)
      returned.add(result.kind)
      setStatus(result.kind, IDLE)
    }

    for (const kind of kinds) {
      if (returned.has(kind)) continue
      // The server omits lists the user may not read. Remember that for this
      // session so we stop asking, and report idle rather than an error —
      // an empty dropdown is the correct outcome, not a failure.
      withheld.add(kind)
      setStatus(kind, IDLE)
    }
  } catch {
    if (gen !== generation) return
    for (const kind of kinds) setStatus(kind, FAILED)
  } finally {
    for (const kind of kinds) inFlight.delete(kind)
  }
}

async function checkRevisions(kinds: LookupKind[]): Promise<void> {
  const gen = generation
  for (const kind of kinds) inFlight.add(kind)

  const changed: LookupKind[] = []
  try {
    const revisions = await fetchLookupRevisions(kinds)
    if (gen !== generation) return

    for (const kind of kinds) {
      const key = lookupCacheKey(kind)
      const entry = readCache(key)
      if (!entry) {
        changed.push(kind)
        continue
      }

      const serverRevision = revisions[kind]
      if (serverRevision === undefined || serverRevision === entry.revision) {
        // Unchanged, or withheld. Rewrite the same rows to restart the TTL so
        // we don't probe again on the very next navigation.
        writeCache(key, entry.data, entry.revision)
      } else {
        changed.push(kind)
      }
    }
  } catch {
    // Leave the cached rows in place and try again on the next mount. A failed
    // probe is not a reason to blank out a working form.
    return
  } finally {
    for (const kind of kinds) inFlight.delete(kind)
  }

  if (changed.length > 0 && gen === generation) await loadRows(changed)
}

/**
 * Forces the named lists to be re-read from the server.
 *
 * Call this after a mutation that changes one of them — adding a supplier,
 * quick-adding a product, booking a सामान आया that moves stock — so the next
 * screen sees the new rows instead of waiting out the TTL.
 */
export function invalidateLookups(kinds: LookupKind | LookupKind[]): void {
  const list = Array.isArray(kinds) ? kinds : [kinds]
  if (list.length === 0) return

  // Invalidate any response still in flight, then let the requests restart.
  generation++
  for (const kind of list) {
    inFlight.delete(kind)
    withheld.delete(kind)
  }

  dropCache(list.map(lookupCacheKey))
  for (const kind of list) request(kind)
}

// ============================================================
// Hooks
// ============================================================

/** Shared empty result, so a cold cache doesn't hand out a new array each render. */
const EMPTY: readonly never[] = Object.freeze([])

export interface UseLookupResult<K extends LookupKind> {
  rows: LookupPayloads[K]
  /** True only while there is nothing cached to render. */
  loading: boolean
  error: string | null
}

/**
 * Reads one reference list, cache first.
 *
 * Returns empty on the server and on the hydration pass, then the cached rows
 * on the commit straight after — reading localStorage during render would make
 * the server and client markup disagree.
 */
export function useLookup<K extends LookupKind>(kind: K): UseLookupResult<K> {
  const entry = useCacheEntry<LookupPayloads[K]>(lookupCacheKey(kind))
  const status = useSyncExternalStore(
    subscribeStatus,
    () => getStatus(kind),
    // The server has no cache to consult, so from its point of view the list is
    // always still on its way.
    () => LOADING
  )

  // Runs on mount and on every remount, which is what makes navigating back to
  // a form revalidate it.
  useEffect(() => {
    request(kind)
  }, [kind])

  const rows = entry ? entry.data : (EMPTY as unknown as LookupPayloads[K])

  return {
    rows,
    loading: entry === null && status.loading,
    error: entry === null ? status.error : null,
  }
}

/**
 * Binds the cache to the signed-in user and drops anything cached for a
 * different one, so a second person on the same shop terminal never inherits
 * lists the first was allowed to see.
 *
 * Rendered above every consumer and bound during render on purpose: a parent's
 * effects run *after* its children's, so binding in an effect would let a child
 * read the previous user's entries first.
 */
export function LookupCacheProvider({
  scope,
  children,
}: {
  scope: string
  children: React.ReactNode
}) {
  setCacheScope(scope)
  return <>{children}</>
}
