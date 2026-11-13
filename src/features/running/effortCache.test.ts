import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { FitnessDB } from '../../db/schema'
import type { Activity, ActivityStream } from '../../db/types'
import { dayTime } from '../../lib/dates'
import { cacheLookup, EFFORT_DISTANCES, EFFORTS_KEY, effortsOf, planEfforts, type EffortCache } from './effortCache'
import { fillEffortCache, readEffortCache, readEffortInput } from './efforts'
import { runEfforts } from './predict'
import { effortsByDistance, personalRecords } from './running'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const

const run = (id: string, date: string, km: number, minutes: number, subSport?: string): Activity => ({
  id,
  date,
  sport: 'running',
  subSport,
  startTime: dayTime(date, '07:00'),
  elapsedSec: minutes * 60,
  timerSec: minutes * 60,
  distanceM: km * 1000,
  laps: [],
  hasTrack: true,
  ...meta,
})

/** A pace that speeds up through the run, so each distance's best stretch is at its end. */
const speedingUp = (km: number, minutes: number) => ({
  step: 5,
  distance: Array.from({ length: minutes * 12 + 1 }, (_, i) => ((i / (minutes * 12)) ** 0.9 * km * 1000)),
})

const runs = [
  run('half', '2026-09-14', 21.3, 105),
  run('ten', '2026-10-05', 10.2, 46),
  run('five', '2026-10-20', 5.1, 22),
  run('mill', '2026-10-22', 8, 40, 'treadmill'),
]
const samples = new Map(runs.map((r) => [r.id, speedingUp((r.distanceM ?? 0) / 1000, r.timerSec / 60)]))

const cacheOf = (entries: Record<string, number>): EffortCache => ({
  v: 1,
  complete: true,
  runs: Object.fromEntries(Object.entries(entries).map(([id, su]) => [id, { su, e: {} }])),
})

describe('effortsOf', () => {
  it('finds each distance the run reached, and none for deleted samples', () => {
    const efforts = effortsOf({ ...samples.get('ten')!, deleted: 0 })
    expect(Object.keys(efforts)).toEqual(['1000', '3000', '5000', '10000'])
    expect(effortsOf({ ...samples.get('ten')!, deleted: 1 })).toEqual({})
    expect(EFFORT_DISTANCES).toEqual([1000, 3000, 5000, 10000, 15000, 21097.5, 42195])
  })
})

describe('planEfforts', () => {
  const runIds = new Set(['a', 'b', 'c', 'd'])

  it('computes what is missing or stale, drops what has no samples or no run, and keeps the rest', () => {
    const cache = cacheOf({ a: 5, b: 5, gone: 3, walk: 2 })
    const plan = planEfforts(
      cache,
      [
        ['a', 5],
        ['b', 9],
        ['c', 1],
        ['walk', 2],
      ],
      runIds,
    )
    expect(plan).toEqual({ compute: ['b', 'c'], drop: ['gone', 'walk'], complete: false })
  })

  it('is complete when every run with samples has its current entry; a run without samples needs none', () => {
    expect(planEfforts(cacheOf({ a: 5 }), [['a', 5]], runIds)).toEqual({ compute: [], drop: [], complete: true })
    expect(planEfforts(undefined, [], runIds)).toEqual({ compute: [], drop: [], complete: true })
  })
})

describe('the cache as a lookup', () => {
  it('gives the same records and predictions as the samples', () => {
    const cache: EffortCache = {
      v: 1,
      complete: true,
      runs: Object.fromEntries([...samples].map(([id, stream]) => [id, { su: 1, e: effortsOf({ ...stream, deleted: 0 }) }])),
    }
    const lookup = cacheLookup(cache)
    expect(personalRecords(runs, lookup)).toEqual(personalRecords(runs, samples))
    expect(effortsByDistance(runs, lookup, 5)).toEqual(effortsByDistance(runs, samples, 5))
    expect(runEfforts(runs, lookup)).toEqual(runEfforts(runs, samples))
    expect(personalRecords(runs, lookup).efforts.map((effort) => effort.short)).toEqual(['1 km', '5 km', '10 km', '21 km'])
  })
})

describe('fillEffortCache', () => {
  const stream = (id: string, updatedAt: number, deleted: 0 | 1 = 0): ActivityStream => ({
    id,
    ...samples.get(id)!,
    updatedAt,
    deleted,
    dirty: 0,
  })

  it('fills from the samples there are, never storing a run whose samples are still on their way', async () => {
    const db = new FitnessDB('efforts-fill')
    await db.activities.bulkPut(runs)
    // "five" has no samples yet; the treadmill run is no outdoor run.
    await db.activityStreams.bulkPut([stream('half', 10), stream('ten', 11), stream('mill', 12)])
    const passes: number[] = []
    const wait = async () => {
      passes.push(Object.keys((await readEffortCache(db))!.runs).length)
    }

    expect(await fillEffortCache(await readEffortInput(db), db, wait)).toBe(true)
    const cache = (await readEffortCache(db))!
    expect(cache.complete).toBe(true)
    expect(Object.keys(cache.runs).sort()).toEqual(['half', 'ten'])
    expect(cache.runs.ten.su).toBe(11)
    expect(passes).toEqual([2])

    // The samples arrive, one run's change and another's are deleted: only those are read again.
    await db.activityStreams.bulkPut([stream('five', 20), stream('ten', 21, 1)])
    await fillEffortCache(await readEffortInput(db), db, wait)
    const after = (await readEffortCache(db))!
    expect(after.runs.five.e['5000']).toBeGreaterThan(0)
    expect(after.runs.ten).toEqual({ su: 21, e: {} })
    expect(after.runs.half).toEqual(cache.runs.half)

    // A deleted activity takes its entry out.
    await db.activities.put({ ...runs[0], deleted: 1 })
    await fillEffortCache(await readEffortInput(db), db, wait)
    expect(Object.keys((await readEffortCache(db))!.runs).sort()).toEqual(['five', 'ten'])
  })

  it('works out again a cache of another version', async () => {
    const db = new FitnessDB('efforts-version')
    await db.activities.bulkPut(runs)
    await db.activityStreams.bulkPut([stream('half', 10)])
    await db.meta.put({ key: EFFORTS_KEY, value: { v: 0, complete: true, runs: {} } })
    expect(await readEffortCache(db)).toBeUndefined()
    await fillEffortCache(await readEffortInput(db), db, async () => {})
    expect((await readEffortCache(db))?.runs.half.su).toBe(10)
  })
})
