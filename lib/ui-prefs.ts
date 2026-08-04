"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Small persisted UI preferences — the sidebar being collapsed, and anything
 * else where re-deciding on every page load is just an annoyance.
 *
 * Kept apart from `lib/client-cache.ts` on purpose: that cache is server data
 * with revisions, TTLs and a per-user scope, whereas these are per-browser
 * choices with none of that machinery. Mixing them would mean pretending a
 * checkbox has a revision.
 */

const PREFIX = "hwerp.ui."

function storage(): Storage | null {
  try {
    // Access rather than a `typeof window` test: Safari's private mode exposes
    // localStorage and throws on use.
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readPref<T>(key: string, fallback: T): T {
  const store = storage()
  if (!store) return fallback
  try {
    const raw = store.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writePref<T>(key: string, value: T): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Full or blocked storage. The preference just won't survive the session.
  }
}

/**
 * Parsed mirror of the stored values.
 *
 * `useSyncExternalStore` requires `getSnapshot` to return the same value while
 * nothing has changed, and `JSON.parse` hands back a fresh object every call, so
 * anything non-primitive would re-render forever without this.
 */
const values = new Map<string, unknown>()
const listeners = new Set<() => void>()
let listeningToOtherTabs = false

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  // Keep two tabs in agreement about the sidebar rather than having them fight.
  if (!listeningToOtherTabs && typeof window !== "undefined") {
    listeningToOtherTabs = true
    window.addEventListener("storage", (event: StorageEvent) => {
      if (event.key !== null && !event.key.startsWith(PREFIX)) return
      values.clear()
      emit()
    })
  }

  return () => listeners.delete(listener)
}

/**
 * `useState` that remembers.
 *
 * Reads `fallback` on the server and on the hydration pass, then the stored
 * value on the commit straight after — touching localStorage during render would
 * make the server markup and the first client render disagree.
 */
export function usePref<T>(key: string, fallback: T): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      if (!values.has(key)) values.set(key, readPref(key, fallback))
      return values.get(key) as T
    },
    () => fallback
  )

  const update = useCallback(
    (next: T) => {
      values.set(key, next)
      writePref(key, next)
      emit()
    },
    [key]
  )

  return [value, update]
}
