import type { Activity } from '../../db/types'

/**
 * An activity as Garmin's activity list sends it. Unlike the file, which stays as the watch recorded
 * it, the list has the activity as it is now in Garmin Connect: cut at the start or the end ("reduzir"),
 * with a distance fixed by hand, and the numbers Garmin worked out again after that.
 */
export interface GarminActivitySummary {
  activityId?: number
  activityName?: string
  /** The start (ms), later after a cut at the start. */
  beginTimestamp?: number
  /** Seconds without the pauses. */
  duration?: number
  /** Seconds with the pauses. */
  elapsedDuration?: number
  /** Meters. */
  distance?: number
  calories?: number
  averageHR?: number
  maxHR?: number
  /** m/s. */
  averageSpeed?: number
  maxSpeed?: number
  /** Meters. */
  elevationGain?: number
  elevationLoss?: number
  averageRunningCadenceInStepsPerMinute?: number
  averageBikingCadenceInRevPerMinute?: number
  avgPower?: number
  maxPower?: number
  normPower?: number
  aerobicTrainingEffect?: number
  anaerobicTrainingEffect?: number
}

/** The stretch of the recording an activity keeps, as times (ms). */
export interface ActivityWindow {
  start: number
  end: number
}

/** How far Garmin's numbers may be from the app's before it counts as an edit, not rounding. */
const SAME = { startMs: 2_000, seconds: 3, meters: 10, distanceShare: 0.003 }

const apart = (a: number | undefined, b: number | undefined, tolerance: number) =>
  a !== undefined && b !== undefined && Math.abs(a - b) > tolerance

/**
 * Whether the activity was changed in Garmin Connect from what the app has: cut, or a new distance.
 * Garmin keeps such an edit apart from the file it sends (the watch's original), so the file alone
 * never shows it.
 */
export function editedInGarmin(
  activity: Pick<Activity, 'startTime' | 'elapsedSec' | 'timerSec' | 'distanceM'>,
  summary: GarminActivitySummary,
): boolean {
  const meters = activity.distanceM ?? 0
  return (
    apart(summary.beginTimestamp, activity.startTime, SAME.startMs) ||
    (summary.elapsedDuration !== undefined
      ? apart(summary.elapsedDuration, activity.elapsedSec, SAME.seconds)
      : apart(summary.duration, activity.timerSec, SAME.seconds)) ||
    apart(summary.distance, meters, Math.max(SAME.meters, meters * SAME.distanceShare))
  )
}

/** The part of the recording Garmin keeps: from its start, for its time with the pauses. */
export function garminWindow(summary: GarminActivitySummary): ActivityWindow | undefined {
  const start = summary.beginTimestamp
  const seconds = summary.elapsedDuration ?? summary.duration
  return start === undefined || seconds === undefined || seconds <= 0 ? undefined : { start, end: start + seconds * 1000 }
}

const whole = (value: number | undefined) => (value === undefined ? undefined : Math.round(value))
const fixed = (value: number | undefined, digits: number) => (value === undefined ? undefined : Number(value.toFixed(digits)))

/** The activity's numbers as Garmin worked them out after the edit, where its list has them. */
export function withGarminTotals<T extends Partial<Activity>>(activity: T, summary: GarminActivitySummary): T {
  return {
    ...activity,
    startTime: summary.beginTimestamp ?? activity.startTime,
    elapsedSec: whole(summary.elapsedDuration) ?? activity.elapsedSec,
    timerSec: whole(summary.duration) ?? activity.timerSec,
    distanceM: fixed(summary.distance, 1) ?? activity.distanceM,
    calories: whole(summary.calories) ?? activity.calories,
    avgHr: whole(summary.averageHR) ?? activity.avgHr,
    maxHr: whole(summary.maxHR) ?? activity.maxHr,
    avgSpeed: fixed(summary.averageSpeed, 3) ?? activity.avgSpeed,
    maxSpeed: fixed(summary.maxSpeed, 3) ?? activity.maxSpeed,
    ascentM: whole(summary.elevationGain) ?? activity.ascentM,
    descentM: whole(summary.elevationLoss) ?? activity.descentM,
    avgCadence: whole(summary.averageRunningCadenceInStepsPerMinute ?? summary.averageBikingCadenceInRevPerMinute) ?? activity.avgCadence,
    avgPower: whole(summary.avgPower) ?? activity.avgPower,
    maxPower: whole(summary.maxPower) ?? activity.maxPower,
    normalizedPower: whole(summary.normPower) ?? activity.normalizedPower,
    aerobicEffect: fixed(summary.aerobicTrainingEffect, 1) ?? activity.aerobicEffect,
    anaerobicEffect: fixed(summary.anaerobicTrainingEffect, 1) ?? activity.anaerobicEffect,
  }
}
