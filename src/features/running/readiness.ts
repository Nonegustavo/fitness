import type { DailyHealth, Pain } from '../../db/types'
import { shiftDay, type DayKey } from '../../lib/dates'
import { formatFixed, formatSigned } from '../../lib/format'
import { sleepQuality } from '../garmin/recovery'
import { painsOn, scoreOn } from '../journal/pains'
import { ACWR_SHORT, type LoadStatus } from './load'

/*
 * Readiness to train, 0–100, in the spirit of Garmin's Training Readiness: last night's sleep, the HRV
 * and the resting heart rate against their normal, and the training load, weighted; pains take points away.
 */

export type ReadinessBand = 'high' | 'moderate' | 'low' | 'veryLow'

export const BANDS: Record<ReadinessBand, { label: string; advice: string; color: string }> = {
  high: { label: 'Alta', advice: 'Bom dia para um treino forte.', color: 'var(--good)' },
  moderate: { label: 'Moderada', advice: 'Dá para treinar; ajuste se sentir cansaço.', color: 'var(--tone-habits)' },
  low: { label: 'Baixa', advice: 'Prefira um treino leve ou de recuperação.', color: 'var(--tone-training)' },
  veryLow: { label: 'Muito baixa', advice: 'Dia de descanso ou de recuperação ativa.', color: 'var(--critical)' },
}

export const readinessBand = (score: number): ReadinessBand =>
  score >= 75 ? 'high' : score >= 50 ? 'moderate' : score >= 25 ? 'low' : 'veryLow'

export type ReadinessKey = 'sleep' | 'hrv' | 'restingHr' | 'load' | 'pains'

export interface ReadinessFactor {
  key: ReadinessKey
  label: string
  /** 0–100, how well it bodes for training; the pains have none, they only take points away. */
  score?: number
  effect: 'up' | 'down' | 'neutral'
  reason: string
}

export interface Readiness {
  date: DayKey
  score: number
  band: ReadinessBand
  /** In a fixed order: sleep, HRV, resting heart rate, load, pains; only the ones there are. */
  factors: ReadinessFactor[]
  /** Points the pains took away. */
  penalty: number
}

/** Each input's weight: the score is their weighted mean over the inputs there are. */
export const WEIGHTS: Record<Exclude<ReadinessKey, 'pains'>, number> = { sleep: 30, hrv: 25, restingHr: 15, load: 20 }
/** The most the pains take away. */
export const PAIN_POINTS = 10
/** The normal of the HRV (when the watch has no range) and of the resting heart rate: the days before. */
const BASELINE_DAYS = 30
const MIN_READINGS = 7

const clamp = (value: number, low = 0, high = 100) => Math.min(high, Math.max(low, value))
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length
const effectOf = (score: number): ReadinessFactor['effect'] => (score >= 70 ? 'up' : score < 50 ? 'down' : 'neutral')

/** A broken line through the points (x going up), flat past its ends. */
function along(points: readonly [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]
    if (x <= x1) {
      const [x0, y0] = points[i - 1]
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
    }
  }
  return points[points.length - 1][1]
}

function sleepFactor(row: DailyHealth | undefined): ReadinessFactor | undefined {
  const score = row?.sleep?.score
  if (score === undefined) return undefined
  return { key: 'sleep', label: 'Sono', score, effect: effectOf(score), reason: `nota ${score} (${sleepQuality(score).toLowerCase()})` }
}

/**
 * Last night's HRV against the watch's normal range, or else the 30 days' mean ± one deviation. Inside
 * the range is good, its top end best; each half range below it costs a lot.
 */
function hrvFactor(row: DailyHealth | undefined, before: DailyHealth[]): ReadinessFactor | undefined {
  const hrv = row?.hrv
  const value = hrv?.lastNight
  if (!hrv || !value) return undefined
  const range = hrvRange(hrv, before)
  if (!range) return undefined
  const { low, high, own } = range
  const z = (value - (low + high) / 2) / Math.max((high - low) / 2, 1)
  const score = clamp(z >= -1 ? 85 + 15 * z : 70 + 50 * (z + 1))
  const where = value < low ? 'abaixo' : value > high ? 'acima' : 'dentro'
  const span = `${Math.round(low)}–${Math.round(high)}`
  return {
    key: 'hrv',
    label: 'HRV',
    score,
    effect: effectOf(score),
    reason: `${value} ms, ${where} ${own ? 'do seu normal' : 'da faixa normal'} (${span})`,
  }
}

/** The watch's balanced range; `own` when it is the 30 days' mean ± one deviation instead. */
function hrvRange(hrv: NonNullable<DailyHealth['hrv']>, before: DailyHealth[]): { low: number; high: number; own: boolean } | undefined {
  const { balancedLow: low, balancedHigh: high } = hrv
  if (low && high && high > low) return { low, high, own: false }
  const readings = before.flatMap((day) => (day.hrv?.lastNight ? [day.hrv.lastNight] : []))
  if (readings.length < MIN_READINGS) return undefined
  const average = mean(readings)
  const deviation = Math.sqrt(mean(readings.map((reading) => (reading - average) ** 2)))
  return { low: average - deviation, high: average + deviation, own: true }
}

/** The resting heart rate against its 30 days' average: each beat above it costs 10 points. */
function restingHrFactor(row: DailyHealth | undefined, before: DailyHealth[]): ReadinessFactor | undefined {
  const value = row?.restingHr
  if (!value) return undefined
  const readings = before.flatMap((day) => (day.restingHr ? [day.restingHr] : []))
  if (readings.length < MIN_READINGS) return undefined
  const baseline = mean(readings)
  const score = clamp(80 - 10 * (value - baseline))
  const off = Math.round(Math.abs(value - baseline))
  return {
    key: 'restingHr',
    label: 'FC de repouso',
    score,
    effect: effectOf(score),
    reason:
      off === 0
        ? `${value} bpm, na média`
        : `${value} bpm, ${off} ${value < baseline ? 'abaixo' : 'acima'} da média (${Math.round(baseline)})`,
  }
}

// A sudden rise of the load against the usual, and a deep fatigue, are what lower readiness.
const ACWR_SCORE: [number, number][] = [[0.8, 95], [1, 90], [1.3, 70], [1.5, 40], [2, 5]]
const FORM_SCORE: [number, number][] = [[-60, 10], [-30, 45], [-10, 75], [5, 95]]

function loadFactor(load: LoadStatus | undefined): ReadinessFactor | undefined {
  if (!load) return undefined
  const scores: number[] = []
  const parts: string[] = []
  if (load.acwr !== undefined && load.flag) {
    scores.push(along(ACWR_SCORE, load.acwr))
    parts.push(`${ACWR_SHORT[load.flag]} (ACWR ${formatFixed(load.acwr, 2)})`)
  }
  if (load.formPct !== undefined && load.zone) {
    scores.push(along(FORM_SCORE, load.formPct))
    parts.push(`forma ${formatSigned(load.formPct, 0)}%`)
  }
  if (scores.length === 0) return undefined
  const score = mean(scores)
  return { key: 'load', label: 'Carga', score, effect: effectOf(score), reason: parts.join(', ') }
}

/** The pains going on that day: the worst one's score in points, one more for each other pain, up to 10. */
function painFactor(pains: Pain[], date: DayKey): { factor?: ReadinessFactor; penalty: number } {
  const scored = painsOn(pains, date).flatMap((pain) => {
    const score = scoreOn(pain, date)
    return score === undefined ? [] : [{ name: pain.name, score }]
  })
  if (scored.length === 0) return { penalty: 0 }
  const penalty = Math.min(PAIN_POINTS, Math.max(...scored.map((pain) => pain.score)) + scored.length - 1)
  return {
    factor: { key: 'pains', label: 'Dores', effect: 'down', reason: scored.map((pain) => `${pain.name} ${pain.score}/10`).join(', ') },
    penalty,
  }
}

export interface ReadinessInput {
  date: DayKey
  /** The watch's days: the date's own and, for the normal, the 30 before it. */
  health: readonly DailyHealth[]
  /** The training load on the date. */
  load?: LoadStatus
  pains?: Pain[]
}

/** The day's readiness; undefined with fewer than two of sleep, HRV, resting heart rate and load to go on. */
export function readiness({ date, health, load, pains = [] }: ReadinessInput): Readiness | undefined {
  const row = health.find((day) => day.id === date)
  const from = shiftDay(date, -BASELINE_DAYS)
  const before = health.filter((day) => day.id >= from && day.id < date)
  const weighted = (
    [
      [sleepFactor(row), WEIGHTS.sleep],
      [hrvFactor(row, before), WEIGHTS.hrv],
      [restingHrFactor(row, before), WEIGHTS.restingHr],
      [loadFactor(load), WEIGHTS.load],
    ] as const
  ).flatMap(([factor, weight]) => (factor ? [{ factor, weight }] : []))
  if (weighted.length < 2) return undefined
  const total = weighted.reduce((sum, { weight }) => sum + weight, 0)
  const base = weighted.reduce((sum, { factor, weight }) => sum + factor.score! * weight, 0) / total
  const pain = painFactor(pains, date)
  const score = Math.round(clamp(base - pain.penalty, 1, 100))
  return {
    date,
    score,
    band: readinessBand(score),
    factors: [...weighted.map(({ factor }) => factor), ...(pain.factor ? [pain.factor] : [])],
    penalty: pain.penalty,
  }
}

/**
 * The day to read: today once the watch has brought its night (or its resting heart rate), else yesterday
 * if it has one (the morning before the sync), else today anyway.
 */
export function readinessDay(health: readonly DailyHealth[], today: DayKey): DayKey {
  const has = (date: DayKey) => {
    const row = health.find((day) => day.id === date)
    return row !== undefined && (row.sleep?.score !== undefined || !!row.hrv?.lastNight || !!row.restingHr)
  }
  const yesterday = shiftDay(today, -1)
  return has(today) || !has(yesterday) ? today : yesterday
}
