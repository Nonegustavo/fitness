import { notifyLocalChange } from '../../db/events'
import { db } from '../../db/schema'
import type { DailyHealth, Synced } from '../../db/types'
import { shiftDay, type DayKey } from '../../lib/dates'

/** The parts of Garmin's daily sleep summary the app keeps. */
export interface GarminSleep {
  calendarDate?: string
  sleepTimeSeconds?: number
  napTimeSeconds?: number
  deepSleepSeconds?: number
  lightSleepSeconds?: number
  remSleepSeconds?: number
  awakeSleepSeconds?: number
  sleepStartTimestampGMT?: number | string
  sleepEndTimestampGMT?: number | string
  avgHeartRate?: number
  averageRespirationValue?: number
  sleepScores?: Record<string, { value?: number } | null | undefined>
}

export interface GarminHrv {
  calendarDate?: string
  lastNightAvg?: number
  weeklyAvg?: number
  status?: string
  baseline?: { balancedLow?: number; balancedUpper?: number } | null
}

export interface GarminDailySummary {
  calendarDate?: string
  heartRate?: { restingValue?: number } | null
  stress?: { avgLevel?: number; maxLevel?: number } | null
  bodyBattery?: { minValue?: number; maxValue?: number; chargedValue?: number; drainedValue?: number } | null
  movement?: { steps?: { value?: number } | null } | null
  calories?: { burnedTotal?: number; burnedActive?: number } | null
}

export type HealthDraft = Omit<DailyHealth, keyof Synced> & { id: DayKey }

// Garmin marks missing values with negatives (-1, -2), so only real readings pass.
const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined
const zeroOrMore = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined

/** Epoch ms, or a UTC date-time written without its "Z". */
function time(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value) return undefined
  const utc = /(Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value.replace(' ', 'T')}Z`
  const parsed = Date.parse(utc)
  return Number.isNaN(parsed) ? undefined : parsed
}

/** Drops undefined fields, and the object itself when nothing is left. */
function compact<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined)
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined
}

/** The overall sleep score; the summary keeps it with the score's parts. */
function sleepScore(scores: GarminSleep['sleepScores']): number | undefined {
  if (!scores) return undefined
  return positive(scores.overall?.value) ?? positive(scores.overallScore?.value) ?? positive(scores.totalScore?.value)
}

/** Joins Garmin's sleep, HRV and daily summaries into one row per day. */
export function mergeHealth(sleeps: GarminSleep[], hrvs: GarminHrv[], summaries: GarminDailySummary[]): HealthDraft[] {
  const days = new Map<DayKey, HealthDraft>()
  const day = (date: string | undefined) => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined
    let row = days.get(date)
    if (!row) {
      row = { id: date }
      days.set(date, row)
    }
    return row
  }

  for (const sleep of sleeps) {
    const totalSec = positive(sleep.sleepTimeSeconds)
    const row = day(sleep.calendarDate)
    if (!row || totalSec === undefined) continue
    row.sleep = {
      totalSec,
      ...compact({
        score: sleepScore(sleep.sleepScores),
        start: time(sleep.sleepStartTimestampGMT),
        end: time(sleep.sleepEndTimestampGMT),
        deepSec: zeroOrMore(sleep.deepSleepSeconds),
        lightSec: zeroOrMore(sleep.lightSleepSeconds),
        remSec: zeroOrMore(sleep.remSleepSeconds),
        awakeSec: zeroOrMore(sleep.awakeSleepSeconds),
        napSec: positive(sleep.napTimeSeconds),
        avgHr: positive(sleep.avgHeartRate),
        avgRespiration: positive(sleep.averageRespirationValue),
      }),
    }
  }

  for (const hrv of hrvs) {
    const lastNight = positive(hrv.lastNightAvg)
    const row = day(hrv.calendarDate)
    if (!row || lastNight === undefined) continue
    row.hrv = compact({
      lastNight,
      weeklyAvg: positive(hrv.weeklyAvg),
      status: hrv.status && hrv.status !== 'NONE' ? hrv.status : undefined,
      balancedLow: positive(hrv.baseline?.balancedLow),
      balancedHigh: positive(hrv.baseline?.balancedUpper),
    })
  }

  for (const summary of summaries) {
    const row = day(summary.calendarDate)
    if (!row) continue
    const restingHr = positive(summary.heartRate?.restingValue)
    if (restingHr !== undefined) row.restingHr = restingHr
    const stress = compact({ avg: zeroOrMore(summary.stress?.avgLevel), max: zeroOrMore(summary.stress?.maxLevel) })
    if (stress) row.stress = stress
    const battery = compact({
      low: zeroOrMore(summary.bodyBattery?.minValue),
      high: zeroOrMore(summary.bodyBattery?.maxValue),
      charged: zeroOrMore(summary.bodyBattery?.chargedValue),
      drained: zeroOrMore(summary.bodyBattery?.drainedValue),
    })
    if (battery) row.bodyBattery = battery
    const steps = zeroOrMore(summary.movement?.steps?.value)
    if (steps !== undefined) row.steps = steps
    const calories = compact({ total: positive(summary.calories?.burnedTotal), active: zeroOrMore(summary.calories?.burnedActive) })
    if (calories) row.calories = calories
  }

  return [...days.values()].filter((row) => Object.keys(row).length > 1)
}

/** JSON with sorted keys: rows rebuilt from the server come back with their keys reordered. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
}

/** Writes the days that changed, keeping fields other sources added to the same day. */
export async function saveHealth(drafts: HealthDraft[]): Promise<number> {
  let changed = 0
  const now = Date.now()
  await db.transaction('rw', db.dailyHealth, async () => {
    for (const draft of drafts) {
      const current = await db.dailyHealth.get(draft.id)
      const { updatedAt: _u, deleted: _d, dirty: _y, ...kept } = current ?? ({} as Partial<DailyHealth>)
      const next = { ...kept, ...draft }
      if (current && !current.deleted && stableJson(kept) === stableJson(next)) continue
      await db.dailyHealth.put({ ...next, updatedAt: now, deleted: 0, dirty: 1 })
      changed++
    }
  })
  if (changed > 0) notifyLocalChange()
  return changed
}

/** [from, to] split into consecutive ranges of at most `size` days, oldest first. */
export function dayChunks(from: DayKey, to: DayKey, size: number): [DayKey, DayKey][] {
  const chunks: [DayKey, DayKey][] = []
  for (let start = from; start <= to; start = shiftDay(start, size)) {
    const end = shiftDay(start, size - 1)
    chunks.push([start, end < to ? end : to])
  }
  return chunks
}
