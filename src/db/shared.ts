import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'

/**
 * Live queries that many components read at once (all activities, all workouts, the settings). Each key
 * runs ONE Dexie subscription, and every component gets the same result object: under Dexie's default
 * `cache: 'cloned'` each useLiveQuery got its own deep copy of the whole table, and `get()` isn't shared
 * at all. Since the result is shared, nobody may change it in place (in development it is frozen, so a
 * mutation throws where it happens).
 */

/** How long a query keeps running after its last reader goes: the next screen finds the answer ready. */
export const LINGER_MS = 30_000

export interface SharedState<T> {
  value: T | undefined
  /** The query failed: rethrown while rendering, as useLiveQuery does. */
  failed: boolean
  error?: unknown
}

export interface SharedStore<T> {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => SharedState<T>
}

interface Entry<T> extends SharedStore<T> {
  state: SharedState<T>
  listeners: Set<() => void>
  subscription?: { unsubscribe: () => void }
  linger?: ReturnType<typeof setTimeout>
}

const LOADING: SharedState<never> = { value: undefined, failed: false }

const entries = new Map<string, Entry<unknown>>()

/** Freezes plain objects and arrays all the way down; class instances (dates, typed arrays) are left alone. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) return value
  Object.freeze(value)
  for (const item of Object.values(value)) deepFreeze(item)
  return value
}

/** The store of one key: created on first use, forgotten a while after its last reader leaves. */
export function sharedStore<T>(key: string, query: () => Promise<T>): SharedStore<T> {
  const found = entries.get(key) as Entry<T> | undefined
  if (found) return found
  const entry: Entry<T> = {
    state: LOADING,
    listeners: new Set(),
    getSnapshot: () => entry.state,
    subscribe: (listener) => {
      clearTimeout(entry.linger)
      entry.linger = undefined
      entry.listeners.add(listener)
      entry.subscription ??= liveQuery(query).subscribe({
        next: (value) => publish({ value: import.meta.env.DEV ? deepFreeze(value) : value, failed: false }),
        error: (error) => publish({ value: entry.state.value, failed: true, error }),
      })
      return () => {
        entry.listeners.delete(listener)
        if (entry.listeners.size > 0) return
        clearTimeout(entry.linger)
        entry.linger = setTimeout(() => {
          entry.subscription?.unsubscribe()
          entry.subscription = undefined
          entry.linger = undefined
          if (entries.get(key) === entry) entries.delete(key)
        }, LINGER_MS)
      }
    },
  }
  const publish = (state: SharedState<T>) => {
    entry.state = state
    for (const listener of [...entry.listeners]) listener()
  }
  entries.set(key, entry as Entry<unknown>)
  return entry
}

/**
 * A live query shared by every component that asks for the same key: undefined while the first answer
 * loads, then the same object for all of them. The key names the query: two different queries never
 * share one.
 */
export function useShared<T>(key: string, query: () => Promise<T>): T | undefined {
  const store = sharedStore(key, query)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  if (state.failed) throw state.error
  return state.value
}
