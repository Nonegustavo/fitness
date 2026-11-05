import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/schema'
import { buildAgenda } from './agenda'
import { changeWalk, dropWalk, plannedToday, scheduleWalk, setEventHidden, setEventTime, undoDropWalk } from './plans'
import { routineWalks } from './walks'

const TODAY = '2026-11-05'
const routine = { days: [3, 5], time: '07:00', targetMin: 40, since: '2026-11-01' }

/** The weekly walks of the next days as the agenda sees them, from what is stored. */
async function weeklyWalks() {
  const plans = await db.workoutPlans.toArray()
  return buildAgenda(TODAY, '2026-11-14', TODAY, { plans, events: null, sessions: [], activities: [], templates: [], walkRoutine: routine })
    .filter((item) => item.kind === 'walk')
    .map((item) => `${item.date} ${item.plan?.time ?? '-'}`)
}

describe('the weekly walk on one day', () => {
  beforeEach(() => db.workoutPlans.clear())

  it('changes that day only, with a row every device finds by its id', async () => {
    const [friday] = routineWalks(routine, [], '2026-11-06', '2026-11-06', TODAY)
    await changeWalk(friday, { time: '18:00' })
    expect(await db.workoutPlans.get('walk-2026-11-06')).toMatchObject({ kind: 'walk', time: '18:00', deleted: 0, dirty: 1 })
    expect(await weeklyWalks()).toEqual(['2026-11-06 18:00', '2026-11-11 07:00', '2026-11-13 07:00'])
  })

  it('comes off that day as a deleted row (synced like any other), and comes back on undo', async () => {
    const [, wednesday] = routineWalks(routine, [], TODAY, '2026-11-14', TODAY)
    await dropWalk(wednesday)
    expect(await db.workoutPlans.get('walk-2026-11-11')).toMatchObject({ deleted: 1, dirty: 1 })
    expect(await weeklyWalks()).toEqual(['2026-11-06 07:00', '2026-11-13 07:00'])
    await undoDropWalk('walk-2026-11-11')
    expect(await weeklyWalks()).toEqual(['2026-11-06 07:00', '2026-11-11 07:00', '2026-11-13 07:00'])
  })

  it('leaves a walk scheduled on its own apart: it moves, and is deleted like a plan', async () => {
    const walk = await scheduleWalk('2026-11-07', { time: '09:00', targetKm: 5 })
    await changeWalk(walk, { date: '2026-11-08', time: undefined, targetKm: 4 })
    expect(await db.workoutPlans.get(walk.id)).toMatchObject({ date: '2026-11-08', targetKm: 4 })
    expect((await db.workoutPlans.get(walk.id))?.time).toBeUndefined()
    await dropWalk((await db.workoutPlans.get(walk.id))!)
    expect((await db.workoutPlans.get(walk.id))?.deleted).toBe(1)
  })

  it('is not the gym workout of the day', async () => {
    const walk = await scheduleWalk(TODAY, { time: '06:00' })
    expect(plannedToday([walk], [{ id: 't', name: 'A', exercises: [], order: 0, updatedAt: 1, deleted: 0, dirty: 0 }], [], TODAY)).toBeUndefined()
  })
})

describe('a Garmin workout hidden on its day', () => {
  const key = 't:corrida 7 km|2026-11-08'
  beforeEach(() => db.eventTimes.clear())

  it('keeps its planned time while hidden, and the time keeps it hidden', async () => {
    await setEventTime(key, '2026-11-08', '07:30')
    await setEventHidden(key, '2026-11-08', true)
    expect(await db.eventTimes.get(key)).toMatchObject({ time: '07:30', hidden: true, deleted: 0 })
    await setEventTime(key, '2026-11-08', undefined)
    expect(await db.eventTimes.get(key)).toMatchObject({ hidden: true, deleted: 0 })
    expect((await db.eventTimes.get(key))?.time).toBeUndefined()
    await setEventTime(key, '2026-11-08', '06:45')
    expect(await db.eventTimes.get(key)).toMatchObject({ time: '06:45', hidden: true })
  })

  it('comes back with the time it had, and leaves nothing behind without one', async () => {
    await setEventTime(key, '2026-11-08', '07:30')
    await setEventHidden(key, '2026-11-08', true)
    await setEventHidden(key, '2026-11-08', false)
    const back = await db.eventTimes.get(key)
    expect(back).toMatchObject({ time: '07:30', deleted: 0 })
    expect(back?.hidden).toBeUndefined()
    await setEventTime(key, '2026-11-08', undefined)
    await setEventHidden(key, '2026-11-08', true)
    await setEventHidden(key, '2026-11-08', false)
    expect((await db.eventTimes.get(key))?.deleted).toBe(1)
  })
})
