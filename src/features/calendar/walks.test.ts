import { describe, expect, it } from 'vitest'
import type { WorkoutPlan } from '../../db/types'
import { goalOf, isRoutineDay, nextRoutine, routineWalkId, routineWalks, walkTarget, walkTitle, weekdaysText } from './walks'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const TODAY = '2026-11-05'

describe('routineWalks', () => {
  const routine = { days: [2, 4], time: '06:30', targetKm: 4, since: '2026-11-03' }

  it('makes the walks of the routine days with the same id on every device', () => {
    expect(routineWalks(routine, [], '2026-11-01', '2026-11-12', TODAY)).toEqual([
      { id: 'walk-2026-11-03', date: '2026-11-03', kind: 'walk', time: '06:30', targetKm: 4, updatedAt: 0, deleted: 0, dirty: 0 },
      { id: 'walk-2026-11-05', date: '2026-11-05', kind: 'walk', time: '06:30', targetKm: 4, updatedAt: 0, deleted: 0, dirty: 0 },
      { id: 'walk-2026-11-10', date: '2026-11-10', kind: 'walk', time: '06:30', targetKm: 4, updatedAt: 0, deleted: 0, dirty: 0 },
      { id: 'walk-2026-11-12', date: '2026-11-12', kind: 'walk', time: '06:30', targetKm: 4, updatedAt: 0, deleted: 0, dirty: 0 },
    ])
  })

  it("uses the day's own row, or leaves the day out when that row was deleted", () => {
    const changed: WorkoutPlan = { id: routineWalkId('2026-11-05'), date: '2026-11-05', kind: 'walk', time: '19:00', ...meta }
    const off: WorkoutPlan = { id: routineWalkId('2026-11-10'), date: '2026-11-10', kind: 'walk', ...meta, deleted: 1 }
    const walks = routineWalks(routine, [changed, off], '2026-11-04', '2026-11-12', TODAY)
    expect(walks.map((walk) => [walk.date, walk.time])).toEqual([
      ['2026-11-05', '19:00'],
      ['2026-11-12', '06:30'],
    ])
  })

  it('tells the routine rows from the walks scheduled on their own', () => {
    expect(isRoutineDay({ id: 'walk-2026-11-05', date: '2026-11-05' })).toBe(true)
    expect(isRoutineDay({ id: 'walk-2026-11-05', date: '2026-11-06' })).toBe(false)
    expect(isRoutineDay({ id: 'a1b2', date: '2026-11-05' })).toBe(false)
  })
})

describe('nextRoutine', () => {
  const current = { days: [1, 3, 5], time: '07:00', since: '2026-10-01' }

  it('keeps the day it started while the days stay, and starts again today when they change', () => {
    expect(nextRoutine(current, [5, 3, 1], { time: '06:30', targetMin: 45 }, TODAY)).toEqual({
      days: [1, 3, 5],
      time: '06:30',
      targetMin: 45,
      since: '2026-10-01',
    })
    expect(nextRoutine(current, [1, 3], { time: '07:00' }, TODAY)).toEqual({ days: [1, 3], time: '07:00', since: TODAY })
    expect(nextRoutine(undefined, [6, 6, 0], {}, TODAY)).toEqual({ days: [0, 6], since: TODAY })
  })

  it('is no routine without a day', () => {
    expect(nextRoutine(current, [], { time: '07:00' }, TODAY)).toBeUndefined()
  })
})

describe('the walk form', () => {
  it('reads the goal in minutes or km, and refuses what makes no sense', () => {
    expect(walkTarget('none', 'x')).toEqual({})
    expect(walkTarget('min', '40')).toEqual({ targetMin: 40 })
    expect(walkTarget('km', '3,5')).toEqual({ targetKm: 3.5 })
    expect(walkTarget('min', '')).toBeNull()
    expect(walkTarget('km', '0')).toBeNull()
    expect(walkTarget('km', '250')).toBeNull()
    expect(goalOf({ targetKm: 3 })).toBe('km')
    expect(goalOf({ targetMin: 30 })).toBe('min')
    expect(goalOf(undefined)).toBe('none')
  })

  it('names the walk by its goal and the days in short', () => {
    expect(walkTitle({ targetMin: 40 })).toBe('Caminhada de 40 min')
    expect(walkTitle({ targetMin: 90 })).toBe('Caminhada de 1h30')
    expect(walkTitle({ targetKm: 3.5 })).toBe('Caminhada de 3,5 km')
    expect(walkTitle({})).toBe('Caminhada')
    expect(weekdaysText([5, 1, 3])).toBe('seg, qua e sex')
    expect(weekdaysText([1, 2, 3, 4, 5])).toBe('seg a sex')
    expect(weekdaysText([6, 0])).toBe('fim de semana')
    expect(weekdaysText([0, 1, 2, 3, 4, 5, 6])).toBe('todo dia')
    expect(weekdaysText([2])).toBe('ter')
  })
})
