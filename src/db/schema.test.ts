import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { FitnessDB, PULL_CURSOR } from './schema'

describe('FitnessDB', () => {
  it('seeds the defaults on a new database', async () => {
    const db = new FitnessDB('fresh')
    expect(await db.exercises.count()).toBeGreaterThan(40)
    expect(await db.waterContainers.count()).toBe(3)
  })

  it('upgrades a version 1 database (the first release) without losing data', async () => {
    const old = new Dexie('from-v1')
    old.version(1).stores({
      weights: 'id, date, dirty',
      measurements: 'id, date, dirty',
      waterContainers: 'id, dirty',
      waterLogs: 'id, date, dirty',
      habits: 'id, dirty',
      habitLogs: 'id, date, habitId, dirty',
      settings: 'id, dirty',
      meta: 'key',
    })
    await old.table('weights').add({ id: 'w1', date: '2026-11-02', time: 0, weightKg: 80, source: 'manual', updatedAt: 1, deleted: 0, dirty: 0 })
    await old.table('meta').put({ key: PULL_CURSOR, value: 42 })
    old.close()

    const db = new FitnessDB('from-v1')
    expect(await db.weights.get('w1')).toMatchObject({ weightKg: 80 })
    expect(await db.exercises.count()).toBeGreaterThan(40)
    expect(await db.foodLogs.count()).toBe(0)
    // Records pushed by newer clients before this device upgraded must be pulled again.
    expect(await db.meta.get(PULL_CURSOR)).toBeUndefined()
  })
})
