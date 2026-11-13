/**
 * Imported before everything else in main.tsx. When the Android app has just switched versions of
 * itself (see boot.ts), the screen that was open is put back here, before the router reads the address.
 */
import { HASH_KEY, session } from './keys'

const hash = session.get(HASH_KEY)
if (hash !== null) {
  session.remove(HASH_KEY)
  try {
    history.replaceState(null, '', `${location.pathname}${location.search}${hash}`)
  } catch {
    // The app opens on its first screen instead.
  }
}
