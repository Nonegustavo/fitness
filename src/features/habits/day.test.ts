import { describe, expect, it } from 'vitest'
import type { Habit, HabitLog } from '../../db/types'
import { dayGoals, dayState, keepOrder, orderForDay } from './day'

let order = 0
const habit = (id: string, changes: Partial<Habit> = {}): Habit => ({
  id,
  name: id,
  kind: 'check',
  polarity: 'good',
  startDate: '2026-10-01',
  archived: 0,
  order: order++,
  updatedAt: 0,
  deleted: 0,
  dirty: 0,
  ...changes,
})
const logs = (entries: Record<string, Pick<HabitLog, 'value' | 'skipped'>>) => new Map(Object.entries(entries))

describe('dayState', () => {
  it('tells open from done, clear from happened, and skipped above all', () => {
    expect(dayState(habit('a'), undefined)).toBe('open')
    expect(dayState(habit('a', { kind: 'count', target: 8 }), { value: 5 })).toBe('open')
    expect(dayState(habit('a'), { value: 1 })).toBe('done')
    expect(dayState(habit('a', { polarity: 'bad' }), { value: 0 })).toBe('clear')
    expect(dayState(habit('a', { polarity: 'bad', kind: 'count', target: 2 }), { value: 1 })).toBe('happened')
    expect(dayState(habit('a'), { value: 0, skipped: 1 })).toBe('skipped')
  })
})

describe('orderForDay', () => {
  const sun = habit('sun', { time: '07:00' })
  const read = habit('read', { time: '22:00' })
  const creatine = habit('creatine')
  const stretch = habit('stretch')
  const alcohol = habit('alcohol', { polarity: 'bad', kind: 'count', unit: 'doses' })
  const coffee = habit('coffee', { polarity: 'bad', reminder: { time: '16:00', days: [1] } })
  const all = [creatine, alcohol, read, stretch, coffee, sun]
  const ids = (list: Habit[]) => list.map((h) => h.id)

  it('puts the timed to-dos first by time, then the others in manual order, then the ones to avoid', () => {
    expect(ids(orderForDay(all, logs({})))).toEqual(['sun', 'read', 'creatine', 'stretch', 'coffee', 'alcohol'])
  })

  it('sends what is settled to the end, by time and then manual order', () => {
    const day = logs({
      read: { value: 1 },
      creatine: { value: 1 },
      sun: { value: 0, skipped: 1 },
      alcohol: { value: 2 },
      coffee: { value: 0 },
    })
    expect(ids(orderForDay(all, day))).toEqual(['stretch', 'coffee', 'sun', 'read', 'creatine', 'alcohol'])
  })

  it('keeps a count not at its goal yet among the to-dos', () => {
    const water = habit('water', { kind: 'count', target: 8, time: '09:00' })
    expect(ids(orderForDay([creatine, water], logs({ water: { value: 3 } })))).toEqual(['water', 'creatine'])
    expect(ids(orderForDay([creatine, water], logs({ water: { value: 8 } })))).toEqual(['creatine', 'water'])
  })
})

describe('keepOrder', () => {
  it('keeps the order on screen, dropping what is gone and adding what is new at the end', () => {
    expect(keepOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['a', 'b', 'c'])
    expect(keepOrder(['a', 'b', 'c'], ['d', 'c', 'a'])).toEqual(['a', 'c', 'd'])
  })
})

describe('dayGoals', () => {
  it('asks only for the habits to do that were not skipped', () => {
    const a = habit('a')
    const b = habit('b')
    const c = habit('c', { polarity: 'bad' })
    const goals = dayGoals([a, b, c], logs({ a: { value: 1 }, b: { value: 0, skipped: 1 } }))
    expect(goals.required.map((h) => h.id)).toEqual(['a'])
    expect(goals.done.map((h) => h.id)).toEqual(['a'])
    expect(goals.left).toEqual([])
    expect(dayGoals([a, b], logs({})).left.map((h) => h.id)).toEqual(['a', 'b'])
  })
})
