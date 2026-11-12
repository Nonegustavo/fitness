import { getSyncState, syncNow } from '../../sync/controller'
import { syncGarmin } from '../garmin/sync'

/**
 * Pulling Hoje down: brings what's new from the server and from Garmin right away, and says in a
 * sentence (for a toast) how it went.
 */
export async function refreshAll(): Promise<string> {
  await Promise.allSettled([syncNow(), syncGarmin()])
  return getSyncState().phase === 'error' ? 'Não deu para sincronizar agora.' : 'Atualizado.'
}
