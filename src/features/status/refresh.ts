import { getSyncState, onSyncStateChange, syncNow } from '../../sync/controller'
import { getGarminState, syncGarmin } from '../garmin/sync'
import { refreshMessage } from './refreshMessage'

/**
 * Pulling Hoje down: brings what's new from the server and from Garmin right away, and says in a
 * sentence (for a toast) how it went.
 */
export async function refreshAll(): Promise<string> {
  const garminWasBusy = getGarminState().phase === 'syncing'
  await Promise.allSettled([syncNow(), syncGarmin()])
  // A sync already running when the page was pulled runs again after it; its outcome is the one to tell.
  await syncSettled()
  const sync = getSyncState()
  const garmin = getGarminState()
  return refreshMessage({
    configured: sync.configured,
    signedIn: !!sync.email,
    expired: sync.expired,
    syncError: sync.phase === 'error' ? (sync.error ?? 'Erro ao sincronizar.') : sync.phase === 'offline' ? 'sem internet.' : undefined,
    // Garmin's last outcome counts only when this refresh ran it (not one already running, whose end isn't awaited).
    garminError: !garminWasBusy && garmin.phase === 'error' ? garmin.lastError : undefined,
    garminBusy: garmin.phase === 'syncing',
  })
}

/** Resolves when the sync isn't running (or after 30 s, so the toast never hangs). */
function syncSettled(): Promise<void> {
  if (getSyncState().phase !== 'syncing') return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      stop()
      resolve()
    }
    const stop = onSyncStateChange(() => {
      if (getSyncState().phase !== 'syncing') finish()
    })
    const timer = setTimeout(finish, 30_000)
  })
}
