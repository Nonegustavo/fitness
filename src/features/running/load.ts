import type { Activity, ActivityStream } from '../../db/types'
import { dayRange, type DayKey } from '../../lib/dates'
import { groupByPeriod, type PeriodWindow } from '../../lib/periods'

/*
 * Training load as Runalyze and intervals.icu show it: each workout's Edwards TRIMP (minutes in heart
 * rate zones 1–5 weighted 1–5), added up per day, and from the daily load fatigue (ATL), fitness (CTL)
 * and form (TSB). TRIMP needs neither the sex nor the max heart rate: the watch's zones already hold them.
 */

type HrStream = Pick<ActivityStream, 'step' | 'hr'>

/** Edwards TRIMP of the zone seconds as the watch gives them: [below zone 1, zone 1, …, zone 5]. */
export function edwardsTrimp(zoneSeconds: readonly number[]): number {
  let load = 0
  for (let zone = 1; zone <= 5; zone++) load += ((zoneSeconds[zone] ?? 0) / 60) * zone
  return load
}

/**
 * Seconds in each zone from heart rate samples, by another activity's limits (the top of "below zone 1",
 * then of zones 1–5); a beat above the last limit is still zone 5.
 */
export function zoneSeconds(stream: HrStream, limits: readonly number[]): number[] {
  const seconds = [0, 0, 0, 0, 0, 0]
  for (const hr of stream.hr ?? []) {
    if (!hr) continue
    const zone = limits.findIndex((limit) => hr <= limit)
    seconds[zone === -1 ? 5 : zone] += stream.step
  }
  return seconds
}

/** An activity whose load needs its samples: the watch gave no zones, but there is a heart rate. */
export const needsSamples = (activity: Pick<Activity, 'hrZones' | 'avgHr'>): boolean => !activity.hrZones && activity.avgHr !== undefined

const hasLimits = (activity: Activity) => (activity.hrZones?.limits.length ?? 0) >= 6

/** The zone limits of the activity nearest in time that has them. */
function nearestLimits(activity: Activity, zoned: readonly Activity[]): number[] | undefined {
  let best: Activity | undefined
  for (const other of zoned) {
    if (!best || Math.abs(other.startTime - activity.startTime) < Math.abs(best.startTime - activity.startTime)) best = other
  }
  return best?.hrZones?.limits
}

/**
 * Each day's load: the TRIMP of every activity with a heart rate (runs, walks, rides, the gym the watch
 * recorded). Without the watch's zones the samples are classified with those of the nearest activity
 * that has them; with neither, the activity is left out.
 */
export function dailyLoads(activities: readonly Activity[], streams: ReadonlyMap<string, HrStream> = new Map()): Map<DayKey, number> {
  const live = activities.filter((activity) => !activity.deleted)
  const zoned = live.filter(hasLimits)
  const loads = new Map<DayKey, number>()
  for (const activity of live) {
    let load: number | undefined
    if (activity.hrZones) load = edwardsTrimp(activity.hrZones.seconds)
    else {
      const stream = streams.get(activity.id)
      const limits = stream?.hr && nearestLimits(activity, zoned)
      if (stream && limits) load = edwardsTrimp(zoneSeconds(stream, limits))
    }
    if (load !== undefined) loads.set(activity.date, (loads.get(activity.date) ?? 0) + load)
  }
  return loads
}

export interface LoadDay {
  date: DayKey
  /** The day's TRIMP. */
  load: number
  /** Fatigue: the load's exponential average over 7 days. */
  atl: number
  /** Fitness: the same over 42 days. */
  ctl: number
  /** Form: fitness minus fatigue. */
  tsb: number
}

export const ATL_DAYS = 7
export const CTL_DAYS = 42

/** Every day from the first with a load up to `to`, both averages starting at zero (the usual daily exponential formulas). */
export function loadSeries(loads: ReadonlyMap<DayKey, number>, to: DayKey): LoadDay[] {
  let first: DayKey | undefined
  for (const day of loads.keys()) if (day <= to && (first === undefined || day < first)) first = day
  if (first === undefined) return []
  const fatigue = 1 - Math.exp(-1 / ATL_DAYS)
  const fitness = 1 - Math.exp(-1 / CTL_DAYS)
  let atl = 0
  let ctl = 0
  return dayRange(first, to).map((date) => {
    const load = loads.get(date) ?? 0
    atl += (load - atl) * fatigue
    ctl += (load - ctl) * fitness
    return { date, load, atl, ctl, tsb: ctl - atl }
  })
}

const sumLoad = (series: readonly LoadDay[], from: number, to: number) => {
  let total = 0
  for (let i = Math.max(0, from); i <= to; i++) total += series[i].load
  return total
}

/**
 * The acute:chronic workload ratio: the last 7 days' load against the weekly average of the last 28 (both
 * up to `index`). Undefined before 4 weeks of history or without any load in them.
 */
export function acwr(series: readonly LoadDay[], index = series.length - 1): number | undefined {
  if (index < 27) return undefined
  const chronic = sumLoad(series, index - 27, index) / 4
  return chronic > 0 ? sumLoad(series, index - 6, index) / chronic : undefined
}

export type AcwrFlag = 'spike' | 'caution' | 'balanced' | 'low'

export const ACWR_FLAGS: Record<AcwrFlag, string> = {
  spike: 'subida brusca: mais risco de lesão',
  caution: 'atenção',
  balanced: 'equilibrada',
  low: 'abaixo do habitual',
}

/** The same for tight spots (a small card, a factor of the readiness). */
export const ACWR_SHORT: Record<AcwrFlag, string> = {
  spike: 'subida brusca',
  caution: 'atenção',
  balanced: 'equilibrada',
  low: 'abaixo do habitual',
}

/** What the last 7 days' load means, in a sentence's second half. */
export const ACWR_SENTENCES: Record<AcwrFlag, string> = {
  spike: 'a carga dos últimos 7 dias subiu de repente, com mais risco de lesão',
  caution: 'a carga dos últimos 7 dias está subindo rápido: atenção',
  balanced: 'a carga dos últimos 7 dias está no seu ritmo habitual',
  low: 'a carga dos últimos 7 dias está abaixo do habitual',
}

export function acwrFlag(ratio: number): AcwrFlag {
  if (ratio > 1.5) return 'spike'
  if (ratio >= 1.3) return 'caution'
  return ratio < 0.8 ? 'low' : 'balanced'
}

/** intervals.icu's form zones, by form as a share of fitness. */
export type FormZone = 'transition' | 'fresh' | 'neutral' | 'optimal' | 'risk'

export const FORM_ZONES: Record<FormZone, { label: string; text: string }> = {
  transition: { label: 'Muito descansado', text: 'o condicionamento começa a cair' },
  fresh: { label: 'Descansado', text: 'bom momento para prova ou treino forte' },
  neutral: { label: 'Zona neutra', text: 'mantém o condicionamento, sem construir' },
  optimal: { label: 'Treinando', text: 'fadiga que constrói condicionamento' },
  risk: { label: 'Fadiga alta', text: 'risco de sobrecarga: vale aliviar' },
}

export function formZone(formPct: number): FormZone {
  if (formPct > 20) return 'transition'
  if (formPct > 5) return 'fresh'
  if (formPct >= -10) return 'neutral'
  return formPct >= -30 ? 'optimal' : 'risk'
}

/** Below this fitness (TRIMP a day) form as a share of it means nothing yet. */
const MIN_CTL = 5

export interface LoadStatus extends LoadDay {
  /** The last 7 days' load. */
  acute: number
  /** The weekly average of the last 28 days. */
  chronic: number
  acwr?: number
  flag?: AcwrFlag
  /** Form as a share of fitness, %. */
  formPct?: number
  zone?: FormZone
}

/** The numbers of a day of the series (the last one by default). */
export function loadStatus(series: readonly LoadDay[], date?: DayKey): LoadStatus | undefined {
  const index = date === undefined ? series.length - 1 : series.findIndex((day) => day.date === date)
  if (index < 0) return undefined
  const day = series[index]
  const ratio = acwr(series, index)
  const formPct = day.ctl >= MIN_CTL ? (day.tsb / day.ctl) * 100 : undefined
  return {
    ...day,
    acute: sumLoad(series, index - 6, index),
    chronic: sumLoad(series, index - 27, index) / 4,
    acwr: ratio,
    flag: ratio === undefined ? undefined : acwrFlag(ratio),
    formPct,
    zone: formPct === undefined ? undefined : formZone(formPct),
  }
}

export interface LoadPeriod {
  start: DayKey
  /** The averages on the period's last day so far; unset before the series starts. */
  day?: LoadDay
  /** The load of its days. */
  load: number
}

/** Each period of a chart's window: fitness, fatigue and form where it ends (today for the current one), and its load. */
export function loadByPeriod(window: PeriodWindow, series: readonly LoadDay[]): LoadPeriod[] {
  return groupByPeriod(window, series, (day) => day.date).map((days, i) => ({
    start: window.buckets[i].start,
    day: days.at(-1),
    load: days.reduce((total, day) => total + day.load, 0),
  }))
}

/** The load of the last `count` blocks of 7 days up to the series' end, oldest first: the last one is the acute week. */
export function weekBlocks(series: readonly LoadDay[], count = 8): number[] {
  const end = series.length - 1
  return Array.from({ length: count }, (_, i) => {
    const last = end - 7 * (count - 1 - i)
    return last < 0 ? 0 : sumLoad(series, last - 6, last)
  })
}
