import type { Draft } from '../../db/repo'
import type { DailyHealth, SleepStage, SleepStageSpan, WeightEntry } from '../../db/types'
import { dayKey, type DayKey } from '../../lib/dates'
import type { BodySample, SleepSessionSample } from './plugin'

/** Garmin Connect copies into Health Connect the weights it already has, so its numbers would repeat. */
export const SKIPPED_BODY_ORIGINS = new Set(['com.garmin.android.apps.connectmobile'])

const round = (value: number | undefined, digits: number): number | undefined =>
  value === undefined ? undefined : Number(value.toFixed(digits))

/**
 * One weigh-in per moment the scale measured: Zepp (or Zepp Life) writes weight, fat, lean mass, bone,
 * water and metabolic rate as separate records with the same time. A group without a weight is skipped.
 */
export function weighIns(samples: BodySample[]): (Draft<WeightEntry> & { id: string })[] {
  const groups = new Map<string, BodySample[]>()
  for (const sample of samples) {
    if (SKIPPED_BODY_ORIGINS.has(sample.origin)) continue
    const key = `${sample.origin}|${Math.round(sample.time / 60_000)}`
    groups.set(key, [...(groups.get(key) ?? []), sample])
  }

  const entries: (Draft<WeightEntry> & { id: string })[] = []
  for (const group of groups.values()) {
    const weight = group.find((sample) => sample.type === 'weight')
    if (!weight || !(weight.value > 0)) continue
    const value = (type: BodySample['type']) => group.find((sample) => sample.type === type)?.value
    const water = value('bodyWater')
    const entry: Draft<WeightEntry> & { id: string } = {
      id: `hc-${weight.id || `${weight.origin}-${weight.time}`}`,
      date: dayKey(weight.time),
      time: weight.time,
      weightKg: round(weight.value, 2)!,
      bodyFatPct: round(value('bodyFat'), 1),
      leanMassKg: round(value('leanMass'), 2),
      boneMassKg: round(value('boneMass'), 2),
      // Health Connect keeps the body's water in kg; the scale shows it as a share of the weight.
      bodyWaterPct: water === undefined ? undefined : round((water / weight.value) * 100, 1),
      bmrKcal: round(value('bmr'), 0),
      source: 'health-connect',
    }
    entries.push(Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined)) as typeof entry)
  }
  return entries.sort((a, b) => a.time - b.time)
}

/** Health Connect's SleepSessionRecord.STAGE_TYPE_* codes; unknown (0) is left out. */
const STAGES: Record<number, SleepStage | undefined> = {
  1: 'awake',
  2: 'light',
  3: 'awake',
  4: 'light',
  5: 'deep',
  6: 'rem',
  7: 'awake',
}

/**
 * The stages of each night, by the day the night ends (as Garmin dates its sleep). When a day has
 * more than one session with stages (a nap), the longest is the night.
 */
export function sleepNights(sessions: SleepSessionSample[]): { id: DayKey; sleepStages: SleepStageSpan[] }[] {
  const nights = new Map<DayKey, SleepSessionSample>()
  for (const session of sessions) {
    if (session.stages.length === 0) continue
    const day = dayKey(session.end)
    const current = nights.get(day)
    if (!current || session.end - session.start > current.end - current.start) nights.set(day, session)
  }

  return [...nights].map(([id, session]) => {
    const spans: SleepStageSpan[] = []
    for (const { start, end, stage } of [...session.stages].sort((a, b) => a.start - b.start)) {
      const kind = STAGES[stage]
      if (!kind || end <= start) continue
      const last = spans.at(-1)
      // Back-to-back stretches of the same stage become one.
      if (last && last.stage === kind && start - last.end <= 60_000) last.end = Math.max(last.end, end)
      else spans.push({ start, end, stage: kind })
    }
    return { id, sleepStages: spans }
  })
}

/**
 * The night's totals from its stages, for nights the Garmin API hasn't brought (older history).
 * Time asleep leaves the awake stretches out, as Garmin counts it.
 */
export function stageTotals(spans: SleepStageSpan[]): NonNullable<DailyHealth['sleep']> | undefined {
  if (spans.length === 0) return undefined
  const seconds = (stage: SleepStage) =>
    Math.round(spans.filter((span) => span.stage === stage).reduce((sum, span) => sum + span.end - span.start, 0) / 1000)
  const deepSec = seconds('deep')
  const lightSec = seconds('light')
  const remSec = seconds('rem')
  return {
    totalSec: deepSec + lightSec + remSec,
    start: spans[0].start,
    end: spans[spans.length - 1].end,
    deepSec,
    lightSec,
    remSec,
    awakeSec: seconds('awake'),
  }
}
