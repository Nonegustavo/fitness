import { describe, expect, it } from 'vitest'
import type { SleepStage, SleepStageSpan } from '../../db/types'
import { describeNight, hourMarks, spanAt, spanLength } from './stageChart'

const MINUTE = 60_000
/** A local time on the night of 5 to 6 November 2026. */
const at = (day: 5 | 6, hours: number, minutes = 0) => new Date(2026, 10, day, hours, minutes).getTime()

/** Consecutive stretches from a start, each [stage, minutes]. */
function night(start: number, parts: [SleepStage, number][]): SleepStageSpan[] {
  let time = start
  return parts.map(([stage, minutes]) => {
    const span = { start: time, end: time + minutes * MINUTE, stage }
    time = span.end
    return span
  })
}

describe('hourMarks', () => {
  it('marks every full hour inside the night and numbers the even ones', () => {
    const marks = hourMarks(at(5, 23, 12), at(6, 6, 48))
    expect(marks.map((mark) => mark.hour)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(marks.filter((mark) => mark.labeled).map((mark) => mark.hour)).toEqual([0, 2, 4, 6])
    expect(marks[0].time).toBe(at(6, 0))
  })

  it('leaves out the hours on the ends themselves', () => {
    expect(hourMarks(at(5, 23), at(6, 1)).map((mark) => mark.hour)).toEqual([0])
    expect(hourMarks(at(6, 2, 10), at(6, 2, 50))).toEqual([])
  })
})

describe('spanAt', () => {
  const spans = night(at(5, 23), [
    ['light', 30],
    ['awake', 1],
    ['light', 20],
    ['deep', 40],
  ])
  const none = () => 0
  // A minimum of 4 minutes for the awakening, as when 3 px are 4 minutes wide.
  const wide = (stage: SleepStage) => (stage === 'awake' ? 4 * MINUTE : 0)

  it('finds the stretch under the time', () => {
    expect(spanAt(spans, at(5, 23, 10), none)?.stage).toBe('light')
    expect(spanAt(spans, at(5, 23, 30) + 30_000, none)?.stage).toBe('awake')
    expect(spanAt(spans, at(6, 0, 10), none)?.stage).toBe('deep')
    expect(spanAt(spans, at(6, 2), none)).toBeUndefined()
  })

  it('picks a short awakening where it is drawn wider, over its neighbors', () => {
    expect(spanAt(spans, at(5, 23, 29), none)?.stage).toBe('light')
    expect(spanAt(spans, at(5, 23, 29), wide)?.stage).toBe('awake')
    expect(spanAt(spans, at(5, 23, 33), wide)?.stage).toBe('light')
  })
})

describe('describeNight', () => {
  it('tells the times, each stage and the awakenings in the middle of the night', () => {
    const spans = night(at(5, 23, 12), [
      ['awake', 8],
      ['light', 60],
      ['deep', 50],
      ['awake', 2],
      ['light', 90],
      ['rem', 25],
      ['awake', 1],
      ['light', 40],
      ['awake', 5],
    ])
    expect(describeNight(spans)).toBe(
      'Fases do sono, das 23:12 às 03:53: profundo 50 min, leve 3h10, REM 25 min, acordado 16 min; acordou 2 vezes no meio da noite',
    )
  })

  it('reads the shortest stretches', () => {
    expect(spanLength({ start: 0, end: 40_000, stage: 'awake' })).toBe('menos de 1 min')
    expect(spanLength({ start: 0, end: 2 * MINUTE, stage: 'awake' })).toBe('2 min')
  })
})
