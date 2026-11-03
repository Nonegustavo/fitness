import { describe, expect, it } from 'vitest'
import { benjaminiHochberg, incompleteBeta, linearFit, median, ranks, spearman, tTestP, welch } from './stats'

describe('distributions', () => {
  it('matches known values of the incomplete beta and Student t', () => {
    expect(incompleteBeta(0.5, 2, 3)).toBeCloseTo(0.6875, 6)
    expect(incompleteBeta(0.2, 0.5, 0.5)).toBeCloseTo((2 / Math.PI) * Math.asin(Math.sqrt(0.2)), 6)
    // Two-sided p of t = 2.228 with 10 degrees of freedom is 0.05.
    expect(tTestP(2.228, 10)).toBeCloseTo(0.05, 3)
    expect(tTestP(0, 10)).toBeCloseTo(1, 6)
  })
})

describe('welch', () => {
  it('finds a clear difference and ignores a tiny one', () => {
    const low = [50, 52, 48, 51, 49, 50, 53, 47]
    const high = [60, 62, 58, 61, 59, 60, 63, 57]
    const clear = welch(high, low)
    expect(clear.diff).toBe(10)
    expect(clear.p).toBeLessThan(0.001)
    expect(clear.d).toBeGreaterThan(3)
    expect(welch([50, 51, 49, 50], [50, 49, 51, 50.5]).p).toBeGreaterThan(0.5)
  })

  it('does not claim anything from two constant groups', () => {
    expect(welch([1, 1, 1], [2, 2, 2]).p).toBe(1)
  })
})

describe('spearman', () => {
  it('ranks ties together and follows a monotonic relation', () => {
    expect(ranks([10, 20, 20, 5])).toEqual([2, 3.5, 3.5, 1])
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const y = x.map((v) => v ** 3)
    expect(spearman(x, y).rho).toBeCloseTo(1, 6)
    const noise = [3, 9, 1, 12, 5, 7, 2, 11, 4, 8, 10, 6]
    expect(spearman(x, noise).p).toBeGreaterThan(0.1)
  })
})

describe('helpers', () => {
  it('computes the median, a trend line and BH q-values', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(linearFit([0, 1, 2], [1, 3, 5])).toEqual({ slope: 2, intercept: 1 })
    // Sorted: 0.01·4/1 = 0.04, 0.03·4/2 = 0.06 → 0.053 (capped by the next), 0.04·4/3 = 0.053, 0.2.
    expect(benjaminiHochberg([0.01, 0.04, 0.03, 0.2])).toEqual(
      [0.04, 0.16 / 3, 0.16 / 3, 0.2].map((q) => expect.closeTo(q, 10)),
    )
  })
})
