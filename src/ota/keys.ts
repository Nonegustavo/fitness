/**
 * What one page leaves in sessionStorage for the next one when the app switches versions in the same
 * process (the WebView keeps sessionStorage across the reload; a new process starts without it).
 */

/** The address (#/…) to put back once the other version loads. */
export const HASH_KEY = 'ota:hash'
/** The folder (or 'public', the APK's own files) the app ran from before a switch: where to go back to. */
export const PREVIOUS_KEY = 'ota:previous'
/** Set when going back to the installed version: that version makes it permanent when it starts. */
export const PERSIST_KEY = 'ota:persist'

/** sessionStorage without throwing (it can be unavailable). */
export const session = {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value)
    } catch {
      // Without it the switch still works; only the screen that was open is lost.
    }
  },
  remove(key: string): void {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // Nothing to clear.
    }
  },
}
