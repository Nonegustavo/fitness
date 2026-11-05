import { describe, expect, it } from 'vitest'
import type { PerformedSet } from '../../db/types'
import {
  firstWorkingLoad,
  formatWarmup,
  nearestBarLoad,
  replaceWarmups,
  suggestWarmup,
  warmupSets,
} from './warmup'

const gym = { barKg: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] }
const ladder = (kg: number, equipment: Parameters<typeof suggestWarmup>[1] = 'barbell', setup = gym) =>
  formatWarmup(suggestWarmup(kg, equipment, setup))

describe('suggestWarmup', () => {
  it('climbs from the empty bar to 80% of a heavy load in four sets', () => {
    expect(suggestWarmup(100, 'barbell', gym)).toEqual([
      { weightKg: 20, reps: 10 },
      { weightKg: 40, reps: 8 },
      { weightKg: 60, reps: 5 },
      { weightKg: 80, reps: 3 },
    ])
    expect(ladder(80)).toBe('20×10 · 32,5×8 · 47,5×5 · 65×3')
    expect(ladder(140, 'smith')).toBe('20×10 · 55×8 · 85×5 · 112,5×3')
  })

  it('uses fewer sets as the load gets lighter, leaving out what the bar already covers', () => {
    // 40% of 60 would be 25, too close to the bar to add anything.
    expect(ladder(60)).toBe('20×10 · 35×5 · 47,5×3')
    expect(ladder(50)).toBe('20×10 · 30×5 · 40×3')
    expect(ladder(30)).toBe('20×10 · 25×3')
    expect(ladder(25)).toBe('20×10')
    // At or barely above the bar there is nothing lighter to warm up with.
    expect(suggestWarmup(22.5, 'barbell', gym)).toEqual([])
    expect(suggestWarmup(20, 'barbell', gym)).toEqual([])
  })

  it('rounds to the loads the gym can make', () => {
    // Without small plates, 32,5 is out of reach: 30 is the nearest.
    expect(ladder(80, 'barbell', { barKg: 20, plates: [20, 10, 5] })).toBe('20×10 · 30×8 · 50×5 · 60×3')
    expect(ladder(100, 'barbell', { barKg: 15, plates: [10, 5, 2.5] })).toBe('15×10 · 40×8 · 60×5 · 80×3')
  })

  it('goes to half and three quarters with dumbbells, machines and cables, to their step', () => {
    expect(ladder(30, 'dumbbell')).toBe('16×10 · 22×6')
    expect(ladder(50, 'machine')).toBe('25×10 · 40×6')
    expect(ladder(20, 'cable')).toBe('10×10 · 15×6')
    // Too light for two steps.
    expect(ladder(4, 'dumbbell')).toBe('2×10')
  })

  it('has nothing for body weight or without a load', () => {
    expect(suggestWarmup(80, 'bodyweight', gym)).toEqual([])
    expect(suggestWarmup(20, 'band', gym)).toEqual([])
    expect(suggestWarmup(0, 'barbell', gym)).toEqual([])
    expect(suggestWarmup(Number.NaN, 'machine', gym)).toEqual([])
  })
})

describe('nearestBarLoad', () => {
  it('picks the closest load the plates make, the lighter one on a tie', () => {
    expect(nearestBarLoad(41, gym)).toBe(40)
    expect(nearestBarLoad(41.5, gym)).toBe(42.5)
    expect(nearestBarLoad(36, { barKg: 20, plates: [5] })).toBe(40)
    expect(nearestBarLoad(30, { barKg: 20, plates: [2.5] })).toBe(30)
    // With pairs of 5 kg plates, 30 and 40 are as close to 35: the lighter one.
    expect(nearestBarLoad(35, { barKg: 20, plates: [5] })).toBe(30)
    expect(nearestBarLoad(10, gym)).toBe(20)
    expect(nearestBarLoad(50, { barKg: 20, plates: [] })).toBe(20)
  })
})

describe('firstWorkingLoad', () => {
  const set = (changes: Partial<PerformedSet>): PerformedSet => ({ key: 'k', kind: 'normal', done: false, ...changes })

  it('takes what is typed, then last time, then the template', () => {
    const warm = set({ kind: 'warmup', weightKg: 20 })
    expect(firstWorkingLoad([warm, set({ weightKg: 70, target: { weightKg: 60 } })], [undefined, set({ weightKg: 65 })])).toBe(70)
    expect(firstWorkingLoad([warm, set({ target: { weightKg: 60 } })], [undefined, set({ weightKg: 65 })])).toBe(65)
    expect(firstWorkingLoad([warm, set({ target: { weightKg: 60 } })], [])).toBe(60)
    expect(firstWorkingLoad([warm], [])).toBeUndefined()
  })
})

describe('replaceWarmups', () => {
  const set = (key: string, kind: PerformedSet['kind'], done = false): PerformedSet => ({ key, kind, done })

  it('swaps the warm-ups still to do, before the working sets', () => {
    const sets = [set('a', 'warmup', true), set('b', 'warmup'), set('1', 'normal', true), set('2', 'normal')]
    const result = replaceWarmups(sets, [set('x', 'warmup'), set('y', 'warmup')])
    expect(result.map((s) => s.key)).toEqual(['a', 'x', 'y', '1', '2'])
    expect(replaceWarmups([set('1', 'normal')], [set('x', 'warmup')]).map((s) => s.key)).toEqual(['x', '1'])
    expect(replaceWarmups([], [set('x', 'warmup')]).map((s) => s.key)).toEqual(['x'])
  })

  it('makes warm-up sets with the loads filled in', () => {
    const [made] = warmupSets([{ weightKg: 40, reps: 8 }])
    expect(made).toMatchObject({ kind: 'warmup', weightKg: 40, reps: 8, done: false })
    expect(made.key).toBeTruthy()
  })
})
