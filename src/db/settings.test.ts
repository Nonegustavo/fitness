import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { FitnessDB, SETTINGS_ID } from './schema'
import { updateSettings } from './settings'
import type { HomeAreas } from './types'

const areasOf = (areas: HomeAreas | undefined): HomeAreas => areas ?? { focus: [], quick: [] }

describe('updateSettings', () => {
  it('keeps both of two changes made at the same moment', async () => {
    const db = new FitnessDB('settings-two-changes')
    // Each starts from what is stored, not from a copy read before the other one wrote.
    await Promise.all([
      updateSettings((settings) => ({ homeAreas: { ...areasOf(settings.homeAreas), now: false } }), db),
      updateSettings((settings) => ({ homeAreas: { ...areasOf(settings.homeAreas), week: false } }), db),
    ])
    expect((await db.settings.get(SETTINGS_ID))?.homeAreas).toMatchObject({ now: false, week: false })
  })

  it('changes only what it is told to and marks the row for sync', async () => {
    const db = new FitnessDB('settings-one-field')
    const before = await db.settings.get(SETTINGS_ID)
    await updateSettings(() => ({ waterGoalMl: 2500 }), db)
    const after = await db.settings.get(SETTINGS_ID)
    expect(after).toMatchObject({ waterGoalMl: 2500, measurementSites: before?.measurementSites, dirty: 1, deleted: 0 })
    expect(after!.updatedAt).toBeGreaterThan(0)
  })

  it('starts from the defaults when the row is missing', async () => {
    const db = new FitnessDB('settings-missing-row')
    await db.settings.delete(SETTINGS_ID)
    await updateSettings(() => ({ heightCm: 178 }), db)
    expect(await db.settings.get(SETTINGS_ID)).toMatchObject({ heightCm: 178, waterGoalMl: 3000 })
  })
})
