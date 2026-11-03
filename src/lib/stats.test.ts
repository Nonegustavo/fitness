import { describe, expect, it } from 'vitest'
import { changeOver, firstPerDay, smoothedTrend } from './stats'

describe('smoothedTrend', () => {
  it('stays flat when every value is the same', () => {
    const trend = smoothedTrend([
      { date: '2026-11-01', value: 80 },
      { date: '2026-11-02', value: 80 },
    ])
    expect(trend.map((p) => p.value)).toEqual([80, 80])
  })

  it('moves 10% toward a new value after one day', () => {
    const trend = smoothedTrend([
      { date: '2026-11-02', value: 90 },
      { date: '2026-11-01', value: 80 },
    ])
    expect(trend[1].value).toBeCloseTo(81)
  })

  it('compounds the smoothing over missing days', () => {
    const trend = smoothedTrend([
      { date: '2026-11-01', value: 80 },
      { date: '2026-11-04', value: 90 },
    ])
    expect(trend[1].value).toBeCloseTo(80 + (1 - 0.9 ** 3) * 10)
  })
})

describe('changeOver', () => {
  const series = [
    { date: '2026-10-20', value: 82 },
    { date: '2026-10-25', value: 81.5 },
    { date: '2026-11-01', value: 81 },
  ]

  it('compares with the latest point at least N days earlier', () => {
    expect(changeOver(series, 7)).toBeCloseTo(-0.5)
  })

  it('is undefined without enough history', () => {
    expect(changeOver(series, 30)).toBeUndefined()
  })
})

describe('firstPerDay', () => {
  it('keeps the earliest entry of each day', () => {
    const items = [
      { date: '2026-11-01', time: 9, id: 'late' },
      { date: '2026-11-01', time: 7, id: 'early' },
      { date: '2026-11-02', time: 8, id: 'only' },
    ]
    expect(firstPerDay(items).map((i) => i.id)).toEqual(['early', 'only'])
  })
})
