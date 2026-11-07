import { describe, expect, it } from 'vitest'
import type { SleepStageSpan } from '../../db/types'
import { nightStages } from './TodaySleepCard'

const minutes = (count: number) => count * 60_000
const span = (stage: SleepStageSpan['stage'], from: number, to: number): SleepStageSpan => ({ stage, start: minutes(from), end: minutes(to) })

describe('nightStages', () => {
  it('uses the watch totals when it has them', () => {
    const parts = nightStages({ totalSec: 25_000, deepSec: 5_000, lightSec: 14_000, remSec: 6_000 }, [span('awake', 0, 600)])
    expect(parts.map((part) => [part.key, part.seconds])).toEqual([
      ['deep', 5_000],
      ['light', 14_000],
      ['rem', 6_000],
    ])
  })

  it('adds the stages up from the night when there are no totals, in the bar order', () => {
    const spans = [span('light', 0, 20), span('deep', 20, 70), span('rem', 70, 85), span('awake', 85, 88), span('light', 88, 118)]
    expect(nightStages({ totalSec: 7_000 }, spans).map((part) => [part.key, part.seconds])).toEqual([
      ['deep', 3_000],
      ['light', 3_000],
      ['rem', 900],
      ['awake', 180],
    ])
  })

  it('has nothing to show with neither', () => {
    expect(nightStages({ totalSec: 7_000 }, undefined)).toEqual([])
    expect(nightStages({ totalSec: 7_000 }, [])).toEqual([])
  })
})
