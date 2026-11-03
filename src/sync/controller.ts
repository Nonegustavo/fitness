import { useSyncExternalStore } from 'react'
import { onLocalChange } from '../db/events'
import { db, PULL_CURSOR } from '../db/schema'
import { syncOnce } from './engine'
import { supabase, supabaseRemote } from './supabase'

export interface SyncState {
  /** False when the build has no Supabase URL/key: the app works offline-only. */
  configured: boolean
  email: string | null
  phase: 'idle' | 'syncing' | 'error' | 'offline'
  lastSyncAt?: number
  error?: string
}

let state: SyncState = { configured: supabase !== null, email: null, phase: 'idle' }
const listeners = new Set<() => void>()

function setState(changes: Partial<SyncState>) {
  state = { ...state, ...changes }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useSyncState = (): SyncState => useSyncExternalStore(subscribe, () => state)

/** For code outside React (the Garmin sync waits for a login). */
export const getSyncState = (): SyncState => state
export const onSyncStateChange = subscribe

let running = false
let runAgain = false
let timer: ReturnType<typeof setTimeout> | undefined

export async function syncNow(): Promise<void> {
  if (!supabase || !state.email) return
  if (!navigator.onLine) {
    setState({ phase: 'offline' })
    return
  }
  if (running) {
    runAgain = true
    return
  }
  running = true
  setState({ phase: 'syncing', error: undefined })
  try {
    await syncOnce(db, supabaseRemote(supabase))
    setState({ phase: 'idle', lastSyncAt: Date.now() })
  } catch (error) {
    setState({ phase: 'error', error: error instanceof Error ? error.message : String(error) })
  } finally {
    running = false
    if (runAgain) {
      runAgain = false
      void syncNow()
    }
  }
}

function scheduleSync(delayMs = 1500) {
  if (!supabase || !state.email) return
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delayMs)
}

/** Wires the sync triggers: login, local writes, reconnecting, reopening the app, and a timer. */
export function startSync(): void {
  if (!supabase) return
  supabase.auth.onAuthStateChange((_event, session) => {
    setState({ email: session?.user.email ?? null })
    if (session) scheduleSync(0)
  })
  onLocalChange(() => scheduleSync())
  window.addEventListener('online', () => scheduleSync(0))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(0)
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') scheduleSync(0)
  }, 60_000)
}

function requireClient() {
  if (!supabase) throw new Error('Sincronização não configurada.')
  return supabase
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOut(): Promise<void> {
  await requireClient().auth.signOut()
  // Local data stays; the next login pulls everything again from the start.
  await db.meta.delete(PULL_CURSOR)
  setState({ phase: 'idle', lastSyncAt: undefined, error: undefined })
}
