import { describe, expect, it } from 'vitest'
import { clockSec, heldSec, timerEnd, type SetTimer } from './setTimer'

const base = { sessionId: 's', exerciseKey: 'e', setKey: 'k', startedAt: 1_000_000, restSec: 60, label: 'Prancha' }
const countdown: SetTimer = { ...base, targetSec: 45 }
const stopwatch: SetTimer = base

describe('set timer', () => {
  it('counts down from the duration, from timestamps', () => {
    expect(timerEnd(countdown)).toBe(1_045_000)
    expect(clockSec(countdown, 1_000_000)).toBe(45)
    // Part of a second left still shows as a second.
    expect(clockSec(countdown, 1_044_100)).toBe(1)
    expect(clockSec(countdown, 1_045_000)).toBe(0)
    // Long after (the app was in the background), it stays at zero.
    expect(clockSec(countdown, 1_900_000)).toBe(0)
  })

  it('counts up without a duration', () => {
    expect(timerEnd(stopwatch)).toBeUndefined()
    expect(clockSec(stopwatch, 1_000_900)).toBe(0)
    expect(clockSec(stopwatch, 1_075_400)).toBe(75)
  })

  it('records the time held, never more than the countdown', () => {
    expect(heldSec(countdown, 1_020_400)).toBe(20)
    expect(heldSec(countdown, 1_300_000)).toBe(45)
    expect(heldSec(stopwatch, 1_090_600)).toBe(91)
    expect(heldSec(stopwatch, 999_000)).toBe(0)
  })
})
