import { describe, expect, it } from 'vitest'
import { editedInGarmin, garminWindow, withGarminTotals, type GarminActivitySummary } from './edits'

const START = Date.UTC(2026, 10, 8, 12, 4, 53)

// The race as the watch recorded it: 6.29 km in 39:24, walking after the finish included.
const recorded = { startTime: START, elapsedSec: 2364, timerSec: 2364, distanceM: 6289 }

// The same race in Garmin's list, untouched: its numbers to the decimal, as Garmin sends them.
const untouched: GarminActivitySummary = {
  activityId: 25008731606,
  beginTimestamp: START,
  elapsedDuration: 2364.31,
  duration: 2363.9,
  distance: 6289.4,
}

// Cut in Garmin Connect at the finish line.
const cut: GarminActivitySummary = {
  ...untouched,
  elapsedDuration: 1781.2,
  duration: 1781.2,
  distance: 5012.6,
  averageHR: 171.4,
  maxHR: 186,
  averageSpeed: 2.8142,
  calories: 402,
  elevationGain: 21,
  averageRunningCadenceInStepsPerMinute: 176.3,
  aerobicTrainingEffect: 4.06,
}

describe('an activity edited in Garmin Connect', () => {
  it('is the same when Garmin only has its own decimals', () => {
    expect(editedInGarmin(recorded, untouched)).toBe(false)
  })

  it('was cut when its time, distance or start changed', () => {
    expect(editedInGarmin(recorded, cut)).toBe(true)
    expect(editedInGarmin(recorded, { ...untouched, beginTimestamp: START + 60_000 })).toBe(true)
    expect(editedInGarmin(recorded, { ...untouched, distance: 6100 })).toBe(true)
    // Without the time with pauses, the time without them tells.
    expect(editedInGarmin(recorded, { beginTimestamp: START, duration: 1781 })).toBe(true)
  })

  it('had its distance set when the app had none', () => {
    expect(editedInGarmin({ ...recorded, distanceM: undefined }, { beginTimestamp: START, elapsedDuration: 2364, distance: 0 })).toBe(false)
    expect(editedInGarmin({ ...recorded, distanceM: undefined }, { beginTimestamp: START, elapsedDuration: 2364, distance: 5000 })).toBe(true)
  })

  it('keeps from the start for its time with the pauses', () => {
    expect(garminWindow(cut)).toEqual({ start: START, end: START + 1_781_200 })
    expect(garminWindow({ beginTimestamp: START, duration: 600 })).toEqual({ start: START, end: START + 600_000 })
    expect(garminWindow({ elapsedDuration: 600 })).toBeUndefined()
  })

  it("takes Garmin's numbers after the edit, keeping the app's where Garmin has none", () => {
    const activity = { ...recorded, avgHr: 160, maxPower: 300, aerobicEffect: 4.5, laps: [] }
    expect(withGarminTotals(activity, cut)).toEqual({
      startTime: START,
      elapsedSec: 1781,
      timerSec: 1781,
      distanceM: 5012.6,
      calories: 402,
      avgHr: 171,
      maxHr: 186,
      avgSpeed: 2.814,
      maxSpeed: undefined,
      ascentM: 21,
      descentM: undefined,
      avgCadence: 176,
      avgPower: undefined,
      maxPower: 300,
      normalizedPower: undefined,
      aerobicEffect: 4.1,
      anaerobicEffect: undefined,
      laps: [],
    })
  })
})
