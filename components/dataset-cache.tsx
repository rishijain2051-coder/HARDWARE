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
import { fetchDatasetRevisions, fetchDatasets } from "@/lib/datasets/actions"
import {
  DATASET_GROUPS,
  DATASET_TTL_MS,
  datasetCacheKey,
  type DatasetKind,
  type DatasetPayloads,
  type ListDatasetKind,
  type MutationTopic,
} from "@/lib/datasets/types"

/**
 * Client half of the browser data cache.
 *
 * Master lists, the entry lists, the ledger and the dashboard figures used to
 * travel in the RSC payload of the page that showed them, so every visit — and
 * this is an app where a storekeeper walks the same six screens all day —
 * re-queried and re-downloaded the lot. Now the pages ship as permission checks
 * and `useDataset` serves the data from localStorage:
 *
 *   fresh cache  -> rendered immediately, zero requests
 *   stale cache  -> rendered immediately, one cheap revision probe in the
 *                   background, data refetched only if something changed
 *   cold cache   -> one batched fetch
 *
 * Requests made by every `useDataset` in a tree are coalesced into a single
 * action call, so a form asking for suppliers, bins and products costs one round
 * trip rather than three.
 */

// ============================================================
// Request status
// ============================================================

interface DatasetStatus {
  loading: boolean
  error: string | null
}

const IDLE: DatasetStatus = { loading: false, error: null }
const LOADING: DatasetStatus = { loading: true, error: null }
const FAILED: DatasetStatus = {
  loading: false,
  error: "Could not load this data. Check your connection and try again.",
}

const statuses = new Map<DatasetKind, DatasetStatus>()
const statusListeners = new Set<() => void>()

/**
 * Unresolved counts as loading.
 *
 * On a full page load the cache cannot be read until after hydration, so for one
 * frame a dataset has no data and no request has started yet. Reporting that as
 * idle paints an empty table that looks like "there are no suppliers"; reporting
 * it as loading paints a skeleton, which is what is actually happening.
 * Client-side navigations skip this entirely — they read the cache during render
 * and never see either state.
 */
function getStatus(kind: DatasetKind): DatasetStatus {
  return statuses.get(kind) ?? LOADING
}

function setStatus(kind: DatasetKind, next: DatasetStatus): void {
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

const wantData = new Set<DatasetKind>()
const wantRevision = new Set<DatasetKind>()
const inFlight = new Set<DatasetKind>()

/**
 * Kinds the server declined to return. Memory-only and intentionally not
 * persisted: a role change should take effect on the next page load rather than
 * leaving a user staring at an empty screen until a TTL expires.
 */
const withheld = new Set<DatasetKind>()

/**
 * Bumped by `invalidateDatasets`. A response tagged with an older generation is
 * discarded — otherwise a revision probe already in flight when the user saves a
 * new product could land afterwards and overwrite the fresh data with what was
 * there before the save.
 */
let generation = 0
let flushScheduled = false

function request(kind: DatasetKind): void {
  if (inFlight.has(kind) || withheld.has(kind)) return

  const entry = readCache(datasetCacheKey(kind))
  if (isFresh(entry, DATASET_TTL_MS[kind])) return

  if (entry) wantRevision.add(kind)
  else wantData.add(kind)

  if (flushScheduled) return
  flushScheduled = true
  // A microtask, so every useDataset effect in this commit lands in one batch.
  void Promise.resolve().then(flush)
}

function flush(): void {
  flushScheduled = false

  const dataKinds = [...wantData].filter((k) => !inFlight.has(k))
  const revisionKinds = [...wantRevision].filter((k) => !inFlight.has(k))
  wantData.clear()
  wantRevision.clear()

  if (dataKinds.length > 0) void loadData(dataKinds)
  if (revisionKinds.length > 0) void checkRevisions(revisionKinds)
}

async function loadData(kinds: DatasetKind[]): Promise<void> {
  const gen = generation
  for (const kind of kinds) {
    inFlight.add(kind)
    // Only announce loading when there is nothing on screen yet; a refresh of
    // already-rendered data should be invisible.
    if (!readCache(datasetCacheKey(kind))) setStatus(kind, LOADING)
  }

  try {
    const results = await fetchDatasets(kinds)
    if (gen !== generation) return

    const returned = new Set<DatasetKind>()
    for (const result of results) {
      writeCache(datasetCacheKey(result.kind), result.data, result.revision)
      returned.add(result.kind)
      setStatus(result.kind, IDLE)
    }

    for (const kind of kinds) {
      if (returned.has(kind)) continue
      // The server omits datasets the user may not read. Remember that for this
      // session so we stop asking, and report idle rather than an error — an
      // empty screen is the correct outcome, not a failure.
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

async function checkRevisions(kinds: DatasetKind[]): Promise<void> {
  const gen = generation
  for (const kind of kinds) inFlight.add(kind)

  const changed: DatasetKind[] = []
  try {
    const revisions = await fetchDatasetRevisions(kinds)
    if (gen !== generation) return

    for (const kind of kinds) {
      const key = datasetCacheKey(kind)
      const entry = readCache(key)
      if (!entry) {
        changed.push(kind)
        continue
      }

      const serverRevision = revisions[kind]
      if (serverRevision === undefined || serverRevision === entry.revision) {
        // Unchanged, or withheld. Rewrite the same data to restart the TTL so we
        // don't probe again on the very next navigation.
        writeCache(key, entry.data, entry.revision)
      } else {
        changed.push(kind)
      }
    }
  } catch {
    // Leave the cached data in place and try again on the next mount. A failed
    // probe is not a reason to blank out a working screen.
    return
  } finally {
    for (const kind of kinds) inFlight.delete(kind)
  }

  if (changed.length > 0 && gen === generation) await loadData(changed)
}

/**
 * Forces the named datasets to be re-read from the server.
 *
 * Prefer `invalidateAfter`, which knows the fan-out for each kind of mutation.
 * Reach for this directly only when a call site genuinely touches one dataset.
 */
export function invalidateDatasets(kinds: DatasetKind | readonly DatasetKind[]): void {
  const list = Array.isArray(kinds) ? [...kinds] : [kinds as DatasetKind]
  if (list.length === 0) return

  // Invalidate any response still in flight, then let the requests restart.
  generation++
  for (const kind of list) {
    inFlight.delete(kind)
    withheld.delete(kind)
  }

  dropCache(list.map(datasetCacheKey))
  for (const kind of list) request(kind)
}

/**
 * Drops everything a given kind of mutation affects.
 *
 *   invalidateAfter("inward")
 *
 * The fan-out lives in DATASET_GROUPS in lib/datasets/types.ts, so a save
 * handler does not have to remember that booking stock also moves the ledger,
 * the dashboard figures and the stock numbers beside every SKU.
 */
export function invalidateAfter(topic: MutationTopic): void {
  invalidateDatasets(DATASET_GROUPS[topic])
}

// ============================================================
// Hooks
// ============================================================

/** Shared empty list, so a cold cache doesn't hand out a new array each render. */
const EMPTY: readonly never[] = Object.freeze([])

export interface UseDatasetResult<K extends DatasetKind> {
  /** Null until something is cached. */
  data: DatasetPayloads[K] | null
  /** True only while there is nothing cached to render. */
  loading: boolean
  error: string | null
}

/**
 * Reads one dataset, cache first.
 *
 * Returns null data on the server and on the hydration pass, then the cached
 * value on the commit straight after — reading localStorage during render would
 * make the server and client markup disagree.
 */
export function useDataset<K extends DatasetKind>(kind: K): UseDatasetResult<K> {
  const entry = useCacheEntry<DatasetPayloads[K]>(datasetCacheKey(kind))
  const status = useSyncExternalStore(
    subscribeStatus,
    () => getStatus(kind),
    // The server has no cache to consult, so from its point of view the data is
    // always still on its way.
    () => LOADING
  )

  // Runs on mount and on every remount, which is what makes navigating back to
  // a screen revalidate it.
  useEffect(() => {
    request(kind)
  }, [kind])

  return {
    data: entry ? entry.data : null,
    loading: entry === null && status.loading,
    error: entry === null ? status.error : null,
  }
}

export interface UseDatasetRowsResult<K extends ListDatasetKind> {
  /** Always an array; empty until the data arrives. */
  rows: DatasetPayloads[K]
  loading: boolean
  error: string | null
}

/**
 * `useDataset` for the list-shaped datasets, which is all of them but the
 * dashboard. Saves every table from writing `data ?? []` and from minting a new
 * empty array on each render while the cache is cold.
 */
export function useDatasetRows<K extends ListDatasetKind>(
  kind: K
): UseDatasetRowsResult<K> {
  const { data, loading, error } = useDataset(kind)
  return {
    rows: (data ?? (EMPTY as unknown as DatasetPayloads[K])),
    loading,
    error,
  }
}

/**
 * Binds the cache to the signed-in user and drops anything cached under a
 * different scope, so a second person on the same shop terminal never inherits
 * data the first was allowed to see.
 *
 * Rendered above every consumer and bound during render on purpose: a parent's
 * effects run *after* its children's, so binding in an effect would let a child
 * read the previous user's entries first.
 */
export function DatasetCacheProvider({
  scope,
  children,
}: {
  scope: string
  children: React.ReactNode
}) {
  setCacheScope(scope)
  return <>{children}</>
}
