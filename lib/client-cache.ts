"use client"

import { useSyncExternalStore } from "react"

/**
 * A small localStorage-backed cache for the reference lists that every data
 * entry screen needs (suppliers, products, bins, units...).
 *
 * Why this exists: those lists were being serialised into the RSC payload of
 * every create/edit page, so opening "नया सामान आया" re-downloaded the entire
 * product master on every single navigation. The lists change rarely and are
 * identical for every screen, which makes them a much better fit for the
 * browser than for the wire.
 *
 * Three rules the rest of the app relies on:
 *
 *  1. Entries are **scoped to a user**. These lists are permission-gated, so a
 *     second person signing in on the same shop terminal must never inherit
 *     what the first one could see. A scope change purges everything.
 *  2. Entries are **versioned**. Bumping CACHE_SCHEMA_VERSION invalidates every
 *     entry, which is the escape hatch when a payload shape changes in a
 *     deploy — otherwise old browsers would feed stale shapes into new code.
 *  3. Nothing here may throw. localStorage is absent in SSR, unavailable in
 *     some private-browsing modes, and throws once it is full. A cache that
 *     breaks the app when it fails is worse than no cache.
 */

/** Bump to invalidate every persisted entry after a payload shape change. */
export const CACHE_SCHEMA_VERSION = 1

const NAMESPACE = "hwerp.c1"
const SCOPE_KEY = `${NAMESPACE}.__scope`

interface Envelope<T> {
  /** Schema version. */
  v: number
  /** Owning user id. */
  s: string
  /** Write time, epoch ms. */
  t: number
  /** Server revision this payload was read at. */
  r: string
  /** Payload. */
  d: T
}

export interface CacheEntry<T> {
  data: T
  /** Epoch ms at which this was written. */
  writtenAt: number
  /** Server revision string, used to skip refetching unchanged lists. */
  revision: string
}

/**
 * Parsed mirror of localStorage.
 *
 * This is not just a speed-up: `useSyncExternalStore` requires `getSnapshot` to
 * return a referentially stable value while nothing has changed, and
 * `JSON.parse` returns a fresh object every call. Without the mirror every
 * render would look like a state change and loop forever.
 *
 * `null` records a known miss; a key absent from the map has simply not been
 * read yet.
 */
const memory = new Map<string, CacheEntry<unknown> | null>()
const listeners = new Set<() => void>()

/** Set once a write fails, so a full disk doesn't make every write retry. */
let persistenceDisabled = false
let currentScope = ""
let storageListenerAttached = false

function storage(): Storage | null {
  if (persistenceDisabled) return null
  try {
    // Access rather than a `typeof window` check: Safari's private mode exposes
    // localStorage and throws on use.
    const s = globalThis.localStorage
    return s ?? null
  } catch {
    persistenceDisabled = true
    return null
  }
}

function notify(): void {
  for (const listener of listeners) listener()
}

/** Every namespaced key currently in localStorage. */
function ownedKeys(store: Storage): string[] {
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (key && key.startsWith(NAMESPACE)) keys.push(key)
  }
  return keys
}

function storageKey(key: string): string {
  return `${NAMESPACE}.${key}`
}

/** Drops everything without waking subscribers. */
function purgeQuietly(): void {
  memory.clear()
  const store = storage()
  if (store) {
    try {
      for (const key of ownedKeys(store)) store.removeItem(key)
    } catch {
      // A failed purge is survivable; the entries are still scope- and
      // version-checked on read.
    }
  }
}

/**
 * Drops every persisted entry. Called on sign-out and as the recovery path when
 * localStorage reports itself full.
 */
export function purgeCache(): void {
  purgeQuietly()
  notify()
}

/**
 * Binds the cache to a user. Anything cached for a different user is dropped,
 * which is what keeps a shared terminal from leaking one user's lists to the
 * next.
 *
 * Safe to call during render and on every render: it is idempotent, and it
 * deliberately does *not* notify subscribers. Callers bind the scope from a
 * component body, above the components that read the cache — waking a
 * subscriber mid-render would mean updating a component while rendering
 * another. Nothing is lost by staying quiet, because a scope only changes on
 * sign-in, which is a fresh page load with no subscribers yet.
 */
export function setCacheScope(scope: string): void {
  if (scope === currentScope) return

  const store = storage()
  const previous = store?.getItem(SCOPE_KEY) ?? ""

  currentScope = scope
  memory.clear()

  if (previous !== scope) {
    purgeQuietly()
    try {
      store?.setItem(SCOPE_KEY, scope)
    } catch {
      persistenceDisabled = true
    }
  }

  attachStorageListener()
}

/**
 * Keeps two tabs of the same app in agreement. Without this, saving a supplier
 * in one tab leaves the other tab serving the list it read before the write.
 */
function attachStorageListener(): void {
  if (storageListenerAttached) return
  if (typeof window === "undefined" || !window.addEventListener) return
  storageListenerAttached = true

  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key === null) {
      // localStorage.clear() elsewhere.
      memory.clear()
      notify()
      return
    }
    if (!event.key.startsWith(NAMESPACE)) return
    // Forget the parsed copy so the next read picks up the other tab's value.
    memory.delete(event.key.slice(NAMESPACE.length + 1))
    notify()
  })
}

function isEnvelope(value: unknown): value is Envelope<unknown> {
  if (typeof value !== "object" || value === null) return false
  const e = value as Partial<Envelope<unknown>>
  return (
    typeof e.v === "number" &&
    typeof e.s === "string" &&
    typeof e.t === "number" &&
    typeof e.r === "string" &&
    "d" in e
  )
}

/**
 * Reads an entry, or null when there is nothing usable cached. Version, scope
 * and shape are all checked, so a stale or foreign entry reads as a miss and is
 * evicted rather than handed to the caller.
 */
export function readCache<T>(key: string): CacheEntry<T> | null {
  const hit = memory.get(key)
  if (hit !== undefined) return hit as CacheEntry<T> | null

  const store = storage()
  if (!store) {
    memory.set(key, null)
    return null
  }

  let entry: CacheEntry<T> | null = null
  try {
    const raw = store.getItem(storageKey(key))
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (
        isEnvelope(parsed) &&
        parsed.v === CACHE_SCHEMA_VERSION &&
        parsed.s === currentScope
      ) {
        entry = { data: parsed.d as T, writtenAt: parsed.t, revision: parsed.r }
      } else {
        // Wrong version, wrong user, or hand-edited: get rid of it.
        store.removeItem(storageKey(key))
      }
    }
  } catch {
    // Corrupt JSON or a storage error. Treated as a miss; the server is the
    // source of truth anyway.
    try {
      store.removeItem(storageKey(key))
    } catch {
      /* nothing further to try */
    }
  }

  memory.set(key, entry)
  return entry
}

/** Writes an entry and wakes every subscriber. */
export function writeCache<T>(key: string, data: T, revision: string): void {
  const entry: CacheEntry<T> = { data, writtenAt: Date.now(), revision }
  memory.set(key, entry)

  const store = storage()
  if (store) {
    const envelope: Envelope<T> = {
      v: CACHE_SCHEMA_VERSION,
      s: currentScope,
      t: entry.writtenAt,
      r: revision,
      d: data,
    }
    const serialised = JSON.stringify(envelope)
    try {
      store.setItem(storageKey(key), serialised)
    } catch {
      // Almost always a quota error. Drop everything and try once more; if the
      // retry also fails, stop persisting for this session and run from memory.
      purgeCache()
      memory.set(key, entry)
      try {
        store.setItem(storageKey(key), serialised)
      } catch {
        persistenceDisabled = true
      }
    }
  }

  notify()
}

/** Forgets specific entries, forcing the next read to go to the server. */
export function dropCache(keys: string | string[]): void {
  const list = Array.isArray(keys) ? keys : [keys]
  if (list.length === 0) return

  const store = storage()
  for (const key of list) {
    memory.delete(key)
    try {
      store?.removeItem(storageKey(key))
    } catch {
      /* leave it; the read path re-validates anyway */
    }
  }
  notify()
}

/** True when `entry` was written within `ttlMs`. */
export function isFresh(entry: CacheEntry<unknown> | null, ttlMs: number): boolean {
  if (!entry) return false
  const age = Date.now() - entry.writtenAt
  // A negative age means the clock moved backwards (or the entry came from a
  // machine with a different clock); treat it as stale rather than immortal.
  return age >= 0 && age < ttlMs
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Subscribes a component to one cache entry.
 *
 * Returns null during server rendering and on the hydration pass, then the
 * cached value immediately afterwards. That ordering is deliberate: reading
 * localStorage while rendering would make the server and client markup
 * disagree, so the swap happens after hydration instead.
 */
export function useCacheEntry<T>(key: string): CacheEntry<T> | null {
  return useSyncExternalStore(
    subscribe,
    () => readCache<T>(key),
    () => null
  )
}
