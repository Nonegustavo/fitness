import { db, PULL_CURSOR } from '../../db/schema'
import { getSyncState, onSyncStateChange, type SyncState } from '../../sync/controller'

/** Signed in and has pulled before, but the sync doesn't finish (offline, an error): go ahead after this. */
export const SYNC_GRACE_MS = 15_000

/**
 * How long an automatic import should wait for this run's first sync, in ms: 0 to go now (no account,
 * or a sync already finished), Infinity when this device has never pulled (what it would add could
 * have been deleted on another device).
 */
export function syncWaitMs(sync: Pick<SyncState, 'configured' | 'email' | 'lastSyncAt'>, hasPulled: boolean): number {
  if (!sync.configured || !sync.email || sync.lastSyncAt !== undefined) return 0
  return hasPulled ? SYNC_GRACE_MS : Infinity
}

/** Resolves when `ready()` holds, checked at every change of the sync state, or after `timeoutMs`. */
function until(ready: () => boolean, timeoutMs: number): Promise<void> {
  if (ready()) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      stop()
      resolve()
    }
    const stop = onSyncStateChange(() => {
      if (ready()) finish()
    })
    const timer = timeoutMs === Infinity ? undefined : setTimeout(finish, timeoutMs)
  })
}

/**
 * Waits until what the server has is on this device, so an import doesn't bring back what another
 * device deleted or overwrite what it changed. See `syncWaitMs`.
 */
export async function afterFirstSync(): Promise<void> {
  if (!getSyncState().configured) return
  // Until the saved login is read, a missing e-mail doesn't mean signed out.
  await until(() => !!getSyncState().authChecked, SYNC_GRACE_MS)
  const hasPulled = (await db.meta.get(PULL_CURSOR)) !== undefined
  const wait = syncWaitMs(getSyncState(), hasPulled)
  if (wait > 0) await until(() => getSyncState().lastSyncAt !== undefined || !getSyncState().email, wait)
}
