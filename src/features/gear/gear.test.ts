import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/schema'
import type { Activity, Gear } from '../../db/types'
import { saveParsed } from '../activities/importFit'
import { defaultGear, deleteGear, fillGear, gearStatus, saveGear, withoutGear } from './gear'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const

const activity = (id: string, date: string, changes: Partial<Activity> = {}): Activity => ({
  id,
  date,
  sport: 'running',
  startTime: Date.parse(`${date}T09:00:00Z`),
  elapsedSec: 1800,
  timerSec: 1800,
  distanceM: 6000,
  laps: [],
  hasTrack: false,
  ...meta,
  ...changes,
})

const pair = (id: string, changes: Partial<Gear> = {}): Gear => ({ id, name: id, kind: 'shoe', ...meta, ...changes })

describe('shoe kilometers', () => {
  it('adds the activities done in a pair to what it had, and warns from 90% of the limit', () => {
    const activities = [
      activity('a1', '2026-10-01', { gearId: 'p1' }),
      activity('a2', '2026-10-03', { gearId: 'p1', distanceM: 10000 }),
      activity('a3', '2026-10-05', { gearId: 'p1', deleted: 1 }),
      activity('a4', '2026-10-05', { gearId: 'p2' }),
    ]
    const [first, second] = gearStatus([pair('p1', { startKm: 614 }), pair('p2', { limitKm: 500 })], activities)
    expect(first).toMatchObject({ km: 630, limitKm: 700, share: 0.9, warn: true, activities: 2 })
    expect(second).toMatchObject({ km: 6, limitKm: 500, warn: false, activities: 1 })
  })

  it('gives a new activity the default pair of its kind, once that pair was in use', () => {
    const gear = [
      pair('road', { defaultFor: ['run'], since: '2026-10-01' }),
      pair('walk', { defaultFor: ['walk'] }),
      pair('old', { defaultFor: ['run'], retired: 1 }),
    ]
    expect(defaultGear(gear, activity('r', '2026-10-02'))?.id).toBe('road')
    expect(defaultGear(gear, activity('r', '2026-09-20'))).toBeUndefined()
    expect(defaultGear(gear, activity('h', '2026-10-02', { sport: 'hiking' }))?.id).toBe('walk')
    expect(defaultGear(gear, activity('b', '2026-10-02', { sport: 'cycling' }))).toBeUndefined()
  })

  it('finds the runs since a day without shoes, which a new pair can take', () => {
    const activities = [
      activity('a1', '2026-09-30'),
      activity('a2', '2026-10-02'),
      activity('a3', '2026-10-03', { gearId: 'p1' }),
      activity('a4', '2026-10-04', { sport: 'walking' }),
      activity('a5', '2026-10-04', { sport: 'cycling' }),
    ]
    expect(withoutGear(activities, ['run'], '2026-10-01').map((a) => a.id)).toEqual(['a2'])
    expect(withoutGear(activities, ['run', 'walk'], '2026-10-01').map((a) => a.id)).toEqual(['a2', 'a4'])
  })
})

describe('shoes in the database', () => {
  beforeEach(async () => {
    await Promise.all([db.gear.clear(), db.activities.clear(), db.activityStreams.clear(), db.meta.clear()])
  })

  it('keeps a single default pair per kind', async () => {
    const first = await saveGear({ name: 'Pegasus', kind: 'shoe', defaultFor: ['run', 'walk'] })
    await saveGear({ name: 'Vomero', kind: 'shoe', defaultFor: ['run'] })
    expect((await db.gear.get(first.id))?.defaultFor).toEqual(['walk'])
  })

  it('fills the runs without shoes since a day, and empties them when the pair is deleted', async () => {
    await db.activities.bulkPut([activity('a1', '2026-09-30'), activity('a2', '2026-10-02'), activity('a3', '2026-10-03', { gearId: 'x' })])
    const shoes = await saveGear({ name: 'Pegasus', kind: 'shoe', defaultFor: ['run'] })
    expect(await fillGear(shoes.id, ['run'], '2026-10-01')).toBe(1)
    expect((await db.activities.get('a2'))).toMatchObject({ gearId: shoes.id, dirty: 1 })
    expect((await db.activities.get('a1'))?.gearId).toBeUndefined()
    await deleteGear(shoes.id)
    expect((await db.activities.get('a2'))?.gearId).toBeUndefined()
    expect((await db.gear.get(shoes.id))?.deleted).toBe(1)
  })

  it('puts the default pair on an imported run, and a new import keeps the pair and the weather', async () => {
    const shoes = await saveGear({ name: 'Pegasus', kind: 'shoe', defaultFor: ['run'], since: '2026-10-01' })
    const { updatedAt: _u, deleted: _d, dirty: _x, ...parsed } = activity('fit-1', '2026-10-10', { hasTrack: true })
    const stream = { id: 'fit-1', step: 1, track: [[-29.1, -51.2], [-29.2, -51.3]] as [number, number][] }
    await saveParsed({ activity: parsed, stream })
    expect((await db.activities.get('fit-1'))?.gearId).toBe(shoes.id)
    // Queued for its weather, which the background run looks up.
    expect((await db.meta.get('weather'))?.value).toMatchObject({ queue: [{ id: 'fit-1' }] })

    await db.activities.update('fit-1', { gearId: 'other', weather: { tempC: 20 } })
    await saveParsed({ activity: parsed, stream })
    expect(await db.activities.get('fit-1')).toMatchObject({ gearId: 'other', weather: { tempC: 20 } })
  })
})
