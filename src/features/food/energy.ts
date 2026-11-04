import { daysBetween, shiftDay, type DayKey } from '../../lib/dates'
import type { DayValue } from '../../lib/stats'

/** Energy in a kilogram of body weight change, the usual figure for a mix of fat and lean tissue. */
export const KCAL_PER_KG = 7700

/** Days with less than this logged look like forgotten logs, not real intake, and are left out. */
const MIN_LOGGED_KCAL = 1000

export interface Expenditure {
  /** Estimated daily expenditure (TDEE), in kcal. */
  kcal: number
  /** Average intake over the days with logs. */
  intake: number
  /** Weight trend change per week, kg (negative when losing). */
  kgPerWeek: number
  /** Days with logs used for the intake. */
  loggedDays: number
  weighIns: number
  windowDays: number
  /** Few logs or weigh-ins make it a rough guess. */
  confidence: 'low' | 'ok'
}

/** Least-squares slope of value over days, per day. */
export function slopePerDay(points: DayValue[]): number | undefined {
  if (points.length < 2) return undefined
  const first = points[0].date
  const xs = points.map((p) => daysBetween(first, p.date))
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
  const meanY = points.reduce((a, p) => a + p.value, 0) / points.length
  let num = 0
  let den = 0
  points.forEach((p, i) => {
    num += (xs[i] - meanX) * (p.value - meanY)
    den += (xs[i] - meanX) ** 2
  })
  return den > 0 ? num / den : undefined
}

/**
 * What the body actually spends, from what was eaten and what the weight did: if the weight trend
 * fell 0,3 kg a week while eating 2300 kcal a day, the spending is ~2300 + 0,3 × 7700 / 7.
 * Uses the window up to yesterday (today isn't over). Undefined without enough data: at least 10 days
 * with logs and 6 weigh-ins spread over 10 days.
 */
export function estimateExpenditure(
  intakeByDay: Map<DayKey, number>,
  weightTrend: DayValue[],
  today: DayKey,
  windowDays = 28,
): Expenditure | undefined {
  const to = shiftDay(today, -1)
  const from = shiftDay(today, -windowDays)
  const intakes = [...intakeByDay.entries()]
    .filter(([date, kcal]) => date >= from && date <= to && kcal >= MIN_LOGGED_KCAL)
    .map(([, kcal]) => kcal)
  const weights = weightTrend.filter((p) => p.date >= from && p.date <= to)
  if (intakes.length < 10 || weights.length < 6) return undefined
  if (daysBetween(weights[0].date, weights.at(-1)!.date) < 10) return undefined
  const slope = slopePerDay(weights)
  if (slope === undefined) return undefined
  const intake = intakes.reduce((a, b) => a + b, 0) / intakes.length
  return {
    kcal: intake - slope * KCAL_PER_KG,
    intake,
    kgPerWeek: slope * 7,
    loggedDays: intakes.length,
    weighIns: weights.length,
    windowDays,
    confidence: intakes.length >= 18 && weights.length >= 12 ? 'ok' : 'low',
  }
}

/** Daily calories for a weekly weight change (kg, negative to lose) on top of the expenditure. */
export const kcalForRate = (expenditure: number, kgPerWeek: number): number =>
  expenditure + (kgPerWeek * KCAL_PER_KG) / 7

/**
 * When the weight reaches the target at a weekly pace, as days from now. Undefined when the pace
 * goes the other way or is too slow to matter (under 50 g a week).
 */
export function daysToTarget(current: number, target: number, kgPerWeek: number): number | undefined {
  const gap = target - current
  if (Math.abs(gap) < 0.05) return 0
  if (Math.abs(kgPerWeek) < 0.05 || Math.sign(gap) !== Math.sign(kgPerWeek)) return undefined
  return Math.round((gap / kgPerWeek) * 7)
}
