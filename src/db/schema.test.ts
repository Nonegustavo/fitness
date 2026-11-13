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

  it('adds the samples’ [id+updatedAt] index without losing data or the pull cursor', async () => {
    // The two tables that matter here, at version 12.
    const v12 = new Dexie('only-v12')
    v12.version(12).stores({ activityStreams: 'id, dirty', meta: 'key' })
    await v12.table('activityStreams').put({ id: 'a1', step: 1, distance: [0, 5], updatedAt: 7, deleted: 0, dirty: 0 })
    await v12.table('meta').put({ key: PULL_CURSOR, value: 42 })
    v12.close()

    const db = new FitnessDB('only-v12')
    expect(await db.activityStreams.get('a1')).toMatchObject({ distance: [0, 5] })
    expect(await db.meta.get(PULL_CURSOR)).toMatchObject({ value: 42 })
    expect(await db.activityStreams.orderBy('[id+updatedAt]').keys()).toEqual([['a1', 7]])
  })
})
