import type { DailyHealth, Settings } from '../../db/types'
import { shiftDay, type DayKey } from '../../lib/dates'
import { formatDuration } from '../../lib/format'
import { BALANCE_NIGHTS, bedtimeHours, clock, clockHours, MIN_USUAL_NIGHTS, SLEEP_GOAL_MIN, USUAL_NIGHTS } from '../insights/metrics'
import { mean, variance } from '../insights/stats'

/** The sleep goal in minutes a night: the one set in Ajustes, or 8 hours. */
export const sleepGoalMin = (settings: Pick<Settings, 'sleepGoalMin'>): number => settings.sleepGoalMin ?? SLEEP_GOAL_MIN

export interface Regularity {
  /** The nights with times it was worked out from. */
  nights: number
  /** The usual bedtime in hours, past midnight as 24+ (00:30 → 24.5). */
  bedtime: number
  /** The usual wake-up time in hours. */
  wake: number
  /** How much each varies around it: the standard deviation, in minutes. */
  bedtimeSdMin: number
  wakeSdMin: number
}

/** The nights ending in the `count` days up to `asOf`, oldest first. */
const nightsUpTo = (days: DailyHealth[], asOf: DayKey, count: number) => {
  const from = shiftDay(asOf, -(count - 1))
  return days.filter((day) => day.sleep && day.id >= from && day.id <= asOf).sort((a, b) => a.id.localeCompare(b.id))
}

const sdMinutes = (hours: number[]) => Math.sqrt(variance(hours)) * 60

/**
 * When the last 14 nights started and ended, on average, and how much that varies; undefined with
 * fewer than 5 nights with times.
 */
export function regularity(days: DailyHealth[], asOf: DayKey): Regularity | undefined {
  const timed = nightsUpTo(days, asOf, USUAL_NIGHTS).flatMap(({ sleep }) =>
    sleep?.start !== undefined && sleep.end !== undefined ? [{ bed: bedtimeHours(sleep.start), wake: clockHours(sleep.end) }] : [],
  )
  if (timed.length < MIN_USUAL_NIGHTS) return undefined
  const beds = timed.map((night) => night.bed)
  const wakes = timed.map((night) => night.wake)
  return { nights: timed.length, bedtime: mean(beds), wake: mean(wakes), bedtimeSdMin: sdMinutes(beds), wakeSdMin: sdMinutes(wakes) }
}

/** How regular, in words: "bem regular" up to about half an hour either way, "varia bastante" past an hour. */
export function regularityWords(regularity: Regularity): 'bem regular' | 'varia um pouco' | 'varia bastante' {
  const spread = Math.round(Math.max(regularity.bedtimeSdMin, regularity.wakeSdMin))
  return spread <= 30 ? 'bem regular' : spread <= 60 ? 'varia um pouco' : 'varia bastante'
}

/** "Nas últimas 2 semanas (12 noites), a hora de dormir e a de acordar são bem regulares." */
export function regularitySentence(regularity: Regularity): string {
  const words = regularityWords(regularity)
  const reads = words === 'bem regular' ? 'são bem regulares' : words === 'varia um pouco' ? 'variam um pouco' : 'variam bastante'
  return `Nas últimas 2 semanas (${regularity.nights} noites), a hora de dormir e a de acordar ${reads}.`
}

export interface SleepBalance {
  /** The nights with sleep among the last 7. */
  nights: number
  /** The sum of (slept − goal) over those nights, in minutes: negative is a debt. */
  balanceMin: number
  /** The mean a night, in minutes. */
  averageMin: number
}

/** The last 7 nights against the goal; naps don't count. Undefined without any night. */
export function sleepBalance(days: DailyHealth[], asOf: DayKey, goalMin: number): SleepBalance | undefined {
  const slept = nightsUpTo(days, asOf, BALANCE_NIGHTS).map((day) => day.sleep!.totalSec / 60)
  if (slept.length === 0) return undefined
  return {
    nights: slept.length,
    balanceMin: slept.reduce((total, minutes) => total + minutes - goalMin, 0),
    averageMin: mean(slept),
  }
}

const hm = (minutes: number) => formatDuration(minutes * 60_000)

/** "+1h20", "−2h10" or "0 min". */
export function signedDuration(minutes: number): string {
  const text = hm(Math.abs(minutes))
  return text === '0 min' ? text : `${minutes > 0 ? '+' : '−'}${text}`
}

/** "23:40", "00:15": a time in hours, past midnight as 24+. */
export { clock }

/** "± 35 min". */
export const spreadText = (minutes: number) => `± ${Math.round(minutes)} min`

/**
 * The balance in a sentence: "Nas últimas 7 noites você dormiu 6h48 em média: 8h20 a menos que a meta
 * no total." Within 15 minutes of the goal a night on average it reads as on target.
 */
export function balanceSentence(balance: SleepBalance): string {
  const nights = balance.nights === BALANCE_NIGHTS ? 'Nas últimas 7 noites' : `Em ${balance.nights} das últimas 7 noites`
  const head = `${nights} você dormiu ${hm(balance.averageMin)} em média`
  if (Math.abs(balance.balanceMin) <= 15 * balance.nights) return `${head}: dentro da meta.`
  return `${head}: ${hm(Math.abs(balance.balanceMin))} a ${balance.balanceMin < 0 ? 'menos' : 'mais'} que a meta no total.`
}
