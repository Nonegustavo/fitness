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

  describe('with weekly habits', () => {
    const weekly = { times: 3, per: 'week' } as const
    const yoga = habit('yoga', { time: '06:00', frequency: weekly })
    const run = habit('run', { frequency: weekly })
    const beer = habit('beer', { polarity: 'bad', frequency: { times: 2, per: 'week' } })
    const list = [creatine, run, yoga, sun, beer, read]
    const open = new Map([
      ['yoga', { met: false }],
      ['run', { met: false }],
      ['beer', { met: true }],
    ])

    it('puts the open ones after the daily habits with a time, their own time sorting them among the rest', () => {
      expect(ids(orderForDay(list, logs({}), open))).toEqual(['sun', 'read', 'yoga', 'creatine', 'run', 'beer'])
    })

    it('settles one whose week is met, or done today', () => {
      const met = new Map([...open, ['run', { met: true }]])
      expect(ids(orderForDay(list, logs({}), met))).toEqual(['sun', 'read', 'yoga', 'creatine', 'beer', 'run'])
      expect(ids(orderForDay(list, logs({ yoga: { value: 1 } }), open))).toEqual(['sun', 'read', 'creatine', 'run', 'beer', 'yoga'])
    })

    it('keeps one to avoid among the ones to avoid until it happens today', () => {
      expect(ids(orderForDay([beer, run], logs({ beer: { value: 1 } }), open))).toEqual(['run', 'beer'])
      expect(ids(orderForDay([creatine, beer, alcohol], logs({ creatine: { value: 1 } }), open))).toEqual(['alcohol', 'beer', 'creatine'])
    })
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

  it('never asks for a weekly habit, but counts it as done the day it is', () => {
    const a = habit('a')
    const run = habit('run', { frequency: { times: 3, per: 'week' } })
    const beer = habit('beer', { polarity: 'bad', frequency: { times: 2, per: 'week' } })
    const open = dayGoals([a, run, beer], logs({}))
    expect(open.required.map((h) => h.id)).toEqual(['a'])
    expect(open.left.map((h) => h.id)).toEqual(['a'])
    const ran = dayGoals([a, run, beer], logs({ a: { value: 1 }, run: { value: 1 } }))
    expect(ran.required.map((h) => h.id)).toEqual(['a', 'run'])
    expect(ran.done.map((h) => h.id)).toEqual(['a', 'run'])
    expect(ran.left).toEqual([])
    // Only weekly habits, none done: nothing asked for today.
    expect(dayGoals([run], logs({})).required).toEqual([])
  })
})
