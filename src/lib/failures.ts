import Dexie from 'dexie'
import { showToast } from '../components/Toast'

/** At most one toast in this long: a burst of failed writes (no room left) says it once. */
const QUIET_MS = 10_000

/**
 * What to tell the user about a promise nobody caught: only when the local database failed (a write
 * that didn't happen). Anything else, like a share sheet closed or a request cancelled, stays quiet.
 */
export function failureMessage(reason: unknown): string | undefined {
  if (!(reason instanceof Dexie.DexieError)) return undefined
  return reason.name === Dexie.errnames.QuotaExceeded
    ? 'Falta espaço neste aparelho: não foi possível salvar.'
    : 'Não foi possível salvar. Tente de novo.'
}

/**
 * Most writes are fired without waiting (`void save(...)`), so one that fails used to vanish without a
 * word, the screen showing the old value again. This says so.
 */
export function watchFailures(): void {
  let lastAt = 0
  window.addEventListener('unhandledrejection', (event) => {
    const message = failureMessage(event.reason)
    if (!message || Date.now() - lastAt < QUIET_MS) return
    lastAt = Date.now()
    showToast({ message })
  })
}
