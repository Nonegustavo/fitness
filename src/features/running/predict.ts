import type { Activity, ActivityStream } from '../../db/types'
import { shiftDay, type DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { shiftPeriod } from '../../lib/periods'
import { bestEffort, isOutdoorRun } from './running'

type DistanceStream = Pick<ActivityStream, 'step' | 'distance'>

/**
 * Daniels and Gilbert's VDOT: the oxygen a pace demands (ml/kg/min) over the share of VO2max that can be
 * held for that long. An estimate of VO2max from a race-like effort, not a lab measure.
 */
export function vdot(meters: number, seconds: number): number {
  const minutes = seconds / 60
  const speed = meters / minutes
  const demand = -4.6 + 0.182258 * speed + 0.000104 * speed ** 2
  const share = 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes)
  return demand / share
}

/** Riegel's formula: the time over another distance, T2 = T1 × (D2 / D1)^1.06. */
export const riegel = (seconds: number, fromMeters: number, toMeters: number): number =>
  seconds * (toMeters / fromMeters) ** 1.06

/** The stretches that tell the fitness: 3 km and up (shorter ones say more about speed than endurance). */
export const REFERENCE_DISTANCES = [3000, 5000, 10000, 15000, 21097.5, 42195]

export const PREDICTED = [
  { meters: 5000, label: '5 km' },
  { meters: 10000, label: '10 km' },
  { meters: 21097.5, label: '21,1 km' },
  { meters: 42195, label: '42,2 km' },
]

/** "10 km", "21,1 km". */
export const distanceLabel = (meters: number): string => `${formatNumber(meters / 1000, 1)} km`

export interface Effort {
  meters: number
  seconds: number
  date: DayKey
  activityId: string
  vdot: number
}

/** Above this a stretch is a GPS glitch, not a run: the best in the world are around 85. */
const MAX_VDOT = 85

/** The fastest stretch of each reference distance in each outdoor run, all in one list. */
export function runEfforts(runs: readonly Activity[], streams: ReadonlyMap<string, DistanceStream>): Effort[] {
  const efforts: Effort[] = []
  for (const run of runs) {
    const stream = streams.get(run.id)
    if (run.deleted || !isOutdoorRun(run) || !stream) continue
    for (const meters of REFERENCE_DISTANCES) {
      // The distances go up: a run that doesn't reach one doesn't reach the next.
      if ((run.distanceM ?? 0) < meters * 0.99) break
      const seconds = bestEffort(stream, meters)
      if (!seconds) continue
      const value = vdot(meters, seconds)
      if (value <= MAX_VDOT) efforts.push({ meters, seconds, date: run.date, activityId: run.id, vdot: value })
    }
  }
  return efforts
}

export interface Prediction {
  meters: number
  label: string
  seconds: number
}

export interface RunFitness {
  /** The best stretch of each reference distance in the window, shortest first. */
  efforts: Effort[]
  /** The one with the highest VDOT: the VO2max estimate. */
  best?: Effort
  /** What the predictions start from: the longest stretch close to the best. */
  reference?: Effort
  predictions: Prediction[]
}

/** Within this share of the best VDOT a stretch was run hard (not an easy run), so it can be predicted from. */
const RELIABLE = 0.95

/**
 * The time Riegel gives from a stretch for another distance, to the 5 seconds (more would be false precision);
 * for the stretch's own distance, its time.
 */
const predict = (from: Effort, meters: number) =>
  meters === from.meters ? Math.round(from.seconds) : Math.round(riegel(from.seconds, from.meters, meters) / 5) * 5

/**
 * The running fitness of the last `days` days: the best stretch of each distance, the VDOT, and the race
 * times Riegel's formula gives from the longest reliable stretch (long ones predict long races better).
 */
export function fitnessOf(efforts: readonly Effort[], today: DayKey, days = 90): RunFitness {
  const from = shiftDay(today, -(days - 1))
  const fastest = new Map<number, Effort>()
  for (const effort of efforts) {
    if (effort.date < from || effort.date > today) continue
    const current = fastest.get(effort.meters)
    if (!current || effort.seconds < current.seconds) fastest.set(effort.meters, effort)
  }
  const list = [...fastest.values()].sort((a, b) => a.meters - b.meters)
  const best = list.reduce<Effort | undefined>((found, effort) => (!found || effort.vdot > found.vdot ? effort : found), undefined)
  const reference = best && list.filter((effort) => effort.vdot >= best.vdot * RELIABLE).at(-1)
  const predictions = reference
    ? PREDICTED.map(({ meters, label }) => ({ meters, label, seconds: predict(reference, meters) }))
    : []
  return { efforts: list, best, reference, predictions }
}

export interface MonthVdot {
  /** The month's first day. */
  month: DayKey
  /** Its stretch with the highest VDOT, when it had one. */
  best?: Effort
}

/** The best VDOT of each of the last `months` months, oldest first: how the estimate went. */
export function monthlyVdot(efforts: readonly Effort[], today: DayKey, months = 12): MonthVdot[] {
  const list: MonthVdot[] = Array.from({ length: months }, (_, i) => ({ month: shiftPeriod('month', today, i - (months - 1)) }))
  const byMonth = new Map(list.map((item) => [item.month.slice(0, 7), item]))
  for (const effort of efforts) {
    const item = byMonth.get(effort.date.slice(0, 7))
    if (item && effort.date <= today && (!item.best || effort.vdot > item.best.vdot)) item.best = effort
  }
  return list
}

export interface RaceDistance {
  meters: number
  /** For a race of "6 a 8 km", its ends; `meters` is then the middle. */
  range?: [number, number]
}

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`
const KM_RANGE = new RegExp(String.raw`${NUMBER}\s*(?:-|–|a|até)\s*${NUMBER}\s*km`, 'i')
const KM = new RegExp(String.raw`${NUMBER}\s*km`, 'i')
const K = new RegExp(String.raw`(?<![\d.,])${NUMBER}\s?k\b`, 'i')
const kilometers = (text: string) => Math.round(parseFloat(text.replace(',', '.')) * 1000)

/** A race's distance from its name: "10 km", "10K", "(6 a 8km)" (the middle), "Meia maratona", "Maratona". */
export function raceDistance(title: string): RaceDistance | undefined {
  const range = KM_RANGE.exec(title)
  if (range) {
    const [low, high] = [kilometers(range[1]), kilometers(range[2])].sort((a, b) => a - b)
    return low === high ? { meters: low } : { meters: (low + high) / 2, range: [low, high] }
  }
  const single = KM.exec(title) ?? K.exec(title)
  if (single) return { meters: kilometers(single[1]) }
  if (/meia[\s-]*maratona|\bmeia\b|\bhalf\b/i.test(title)) return { meters: 21097.5 }
  if (/maratona|marathon/i.test(title)) return { meters: 42195 }
  return undefined
}

export interface RaceTime {
  meters: number
  seconds: number
}

export interface RacePrediction extends RaceTime {
  /** For a race given as a range, the time for each of its ends. */
  ends?: [RaceTime, RaceTime]
  reference: Effort
}

/** The time for a race's distance (and for the ends of its range), by Riegel from the fitness' reference. */
export function predictRace(fitness: RunFitness, distance: RaceDistance): RacePrediction | undefined {
  const { reference } = fitness
  if (!reference) return undefined
  const at = (meters: number): RaceTime => ({ meters, seconds: predict(reference, meters) })
  return {
    ...at(distance.meters),
    ends: distance.range && [at(distance.range[0]), at(distance.range[1])],
    reference,
  }
}
