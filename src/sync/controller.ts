import { useSyncExternalStore } from 'react'
import { onLocalChange } from '../db/events'
import { db, PULL_CURSOR } from '../db/schema'
import { syncOnce } from './engine'
import { describeSyncError } from './errors'
import { supabase, supabaseRemote } from './supabase'

export interface SyncState {
  /** False when the build has no Supabase URL/key: the app works offline-only. */
  configured: boolean
  email: string | null
  /** Whether the saved login has been read yet: until then a null `email` doesn't mean signed out. */
  authChecked?: boolean
  /**
   * The saved login was read, there is no session, and this device had been signed in (and never
   * chose "Sair"): the session expired, which is a problem to fix, not sync turned off.
   */
  expired: boolean
  /** The e-mail this device was last signed in with, to fill in the login form again. */
  accountEmail?: string
  phase: 'idle' | 'syncing' | 'error' | 'offline'
  /** When a sync finished in this run of the app (in memory only: other code waits for the first one). */
  lastSyncAt?: number
  /** When a sync last worked on this device, kept across restarts. */
  lastOkAt?: number
  /** The last sync's problem, in Portuguese. */
  error?: string
  /** Supabase's own text of that problem, when the message doesn't say it all. */
  errorDetail?: string
}

/** This device was signed in, with this e-mail (removed by "Sair"). */
const ACCOUNT_KEY = 'account'
/** When a sync last worked on this device. */
const LAST_OK_KEY = 'lastSyncOk'

let state: SyncState = { configured: supabase !== null, email: null, expired: false, phase: 'idle' }
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
  setState({ phase: 'syncing', error: undefined, errorDetail: undefined })
  try {
    await syncOnce(db, supabaseRemote(supabase))
    const now = Date.now()
    await db.meta.put({ key: LAST_OK_KEY, value: now }).catch(() => undefined)
    setState({ phase: 'idle', lastSyncAt: now, lastOkAt: now })
  } catch (error) {
    const problem = describeSyncError(error)
    setState({ phase: 'error', error: problem.message, errorDetail: problem.detail })
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

const readAccount = async (): Promise<string | undefined> =>
  ((await db.meta.get(ACCOUNT_KEY))?.value as { email?: string } | undefined)?.email

/** Each auth event's reading of the saved account; a later event's wins over an earlier one still reading. */
let authEvents = 0

/** Wires the sync triggers: login, local writes, reconnecting, reopening the app, and a timer. */
export function startSync(): void {
  if (!supabase) return
  void db.meta
    .get(LAST_OK_KEY)
    .then((row) => {
      if (state.lastOkAt === undefined && typeof row?.value === 'number') setState({ lastOkAt: row.value })
    })
    .catch(() => undefined)
  supabase.auth.onAuthStateChange((_event, session) => {
    const event = ++authEvents
    const email = session?.user.email ?? null
    if (session) {
      setState({ email, authChecked: true, expired: false, accountEmail: email ?? undefined })
      // Remembered so a lost session later reads as expired, not as signed out on purpose.
      void db.meta.put({ key: ACCOUNT_KEY, value: { email } }).catch(() => undefined)
      scheduleSync(0)
      return
    }
    // No session: signed out on purpose, never signed in, or the session expired. `authChecked` waits
    // for the answer, so the screens don't flash the wrong one.
    void readAccount()
      .catch(() => undefined)
      .then((account) => {
        if (event !== authEvents) return
        setState({ email: null, authChecked: true, expired: account !== undefined, accountEmail: account })
      })
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

/** Signs this device out (the others stay signed in); the data stays here. */
export async function signOut(): Promise<void> {
  const client = requireClient()
  // Forgotten first, so the auth event that follows reads "signed out", not "expired".
  await db.meta.bulkDelete([ACCOUNT_KEY, LAST_OK_KEY])
  // `local`: the default scope ends the session on every device.
  await client.auth.signOut({ scope: 'local' })
  // Local data stays; the next login pulls everything again from the start.
  await db.meta.delete(PULL_CURSOR)
  setState({
    phase: 'idle',
    expired: false,
    accountEmail: undefined,
    lastSyncAt: undefined,
    lastOkAt: undefined,
    error: undefined,
    errorDetail: undefined,
  })
}
