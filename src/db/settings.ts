import { notifyLocalChange } from './events'
import { db, DEFAULT_SETTINGS, SETTINGS_ID, type FitnessDB } from './schema'
import type { Settings, Synced } from './types'

/** Some of the settings' own fields (never the sync bookkeeping). */
export type SettingsChange = Partial<Omit<Settings, keyof Synced>>

/**
 * Changes the settings starting from what is stored right now, inside a transaction, and marks them
 * for sync. A change built from the last render (a whole sub-object handed to `patch`) overwrote one
 * made a moment before, while the screen hadn't drawn it yet: two quick taps on two switches kept only
 * the second.
 */
export async function updateSettings(
  change: (settings: Settings) => SettingsChange,
  database: FitnessDB = db,
): Promise<void> {
  await database.transaction('rw', database.settings, async () => {
    const current: Settings = (await database.settings.get(SETTINGS_ID)) ?? {
      id: SETTINGS_ID,
      ...DEFAULT_SETTINGS,
      updatedAt: 0,
      deleted: 0,
      dirty: 0,
    }
    await database.settings.put({ ...current, ...change(current), id: SETTINGS_ID, updatedAt: Date.now(), dirty: 1 })
  })
  notifyLocalChange()
}
