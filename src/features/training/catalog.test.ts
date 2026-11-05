import { describe, expect, it } from 'vitest'
import { formatComparison, formatE1rm, formatSet } from './catalog'

describe('formatSet', () => {
  it('writes load × reps, and PC (peso corporal) for sets without a load', () => {
    expect(formatSet({ weightKg: 62.5, reps: 10 }, 'weight_reps')).toBe('62,5×10')
    expect(formatSet({ reps: 10 }, 'weight_reps')).toBe('PC×10')
    expect(formatSet({ weightKg: 0, reps: 8 }, 'weight_reps')).toBe('PC×8')
    expect(formatSet({ weightKg: 20, reps: 12 }, 'reps')).toBe('PC×12')
    expect(formatSet({}, 'reps')).toBe('')
  })

  it('writes the duration of timed sets', () => {
    expect(formatSet({ durationSec: 45 }, 'time')).toBe('0:45')
    expect(formatSet({}, 'time')).toBe('')
  })
})

describe('formatComparison', () => {
  it('shows the estimated 1RM to a tenth of a kilo', () => {
    expect(formatE1rm(83.333)).toBe('1RM 83,3')
    expect(formatComparison({ metric: 'e1rm', value: 80, trend: 'up' })).toBe('1RM 80')
  })

  it('signs the reps and the time against last time', () => {
    expect(formatComparison({ metric: 'reps', delta: 2, trend: 'up' })).toBe('+2 reps')
    expect(formatComparison({ metric: 'reps', delta: -1, trend: 'down' })).toBe('−1 rep')
    expect(formatComparison({ metric: 'reps', delta: 0, trend: 'same' })).toBe('±0 reps')
    expect(formatComparison({ metric: 'time', delta: 10, trend: 'up' })).toBe('+0:10')
    expect(formatComparison({ metric: 'time', delta: -75, trend: 'down' })).toBe('−1:15')
  })
})
