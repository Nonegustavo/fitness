import { formatDay, WEEK_STARTS_ON, type DayKey } from './dates'
import type { DayValue } from './stats'

/** How a chart groups its days: one point per day, per week (Sunday to Saturday), per month or per year. */
export type Grain = 'day' | 'week' | 'month' | 'year'

/** The grains that show a number of periods; the year view shows every year with data. */
export type LengthGrain = Exclude<Grain, 'year'>

export const GRAINS: { value: Grain; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'year', label: 'Ano' },
]

/** The window lengths the "Intervalo" sheet offers, in periods of each grain. */
export const LENGTHS: Record<LengthGrain, readonly number[]> = {
  day: [7, 14, 30, 60, 90],
  week: [8, 12, 26, 52],
  month: [6, 12, 24, 36],
}

export const DEFAULT_LENGTHS: Record<LengthGrain, number> = { day: 30, week: 12, month: 12 }

/** Past this many periods a picked range keeps its latest ones, so a typo in a year can't stall the chart. */
const MAX_PERIODS = 1500

export interface DayRange {
  from: DayKey
  to: DayKey
}

/** What the user picked for a screen's charts; each screen remembers its own. */
export interface PeriodChoice {
  grain: Grain
  /** How many periods the window shows, for each grain. */
  lengths: Record<LengthGrain, number>
  /** A from–to range picked by hand, in place of the latest periods. */
  custom?: DayRange
}

export const defaultChoice = (grain: Grain = 'day'): PeriodChoice => ({ grain, lengths: { ...DEFAULT_LENGTHS } })

/** One period on a chart: a day, a week, a month or a year. */
export interface Bucket {
  start: DayKey
  /** Its last day (the Saturday, the end of the month), even while that is still ahead. */
  end: DayKey
}

export interface PeriodWindow {
  grain: Grain
  buckets: Bucket[]
  /** The first day shown and the last one, which is never after today. */
  from: DayKey
  to: DayKey
  today: DayKey
  /** Every year with data: there is nowhere to move it to. */
  fixed: boolean
}

// Calendar arithmetic on day numbers (days since 1970-01-01), in UTC so no time zone or DST change moves a day.
const DAY_MS = 86_400_000
const toEpoch = (day: DayKey): number =>
  Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS
const fromEpoch = (n: number): DayKey => new Date(n * DAY_MS).toISOString().slice(0, 10)

/** A number for each period of a grain, going up by one from a period to the next. */
function periodIndex(grain: Grain, day: DayKey): number {
  switch (grain) {
    case 'day':
      return toEpoch(day)
    case 'week':
      // 1970-01-01 was a Thursday, day 4 counting from Sunday.
      return Math.floor((toEpoch(day) + 4 - WEEK_STARTS_ON) / 7)
    case 'month':
      return Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1
    case 'year':
      return Number(day.slice(0, 4))
  }
}

/** The first day of the period with that number. */
function periodAt(grain: Grain, index: number): DayKey {
  switch (grain) {
    case 'day':
      return fromEpoch(index)
    case 'week':
      return fromEpoch(index * 7 - 4 + WEEK_STARTS_ON)
    case 'month':
      return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`
    case 'year':
      return `${index}-01-01`
  }
}

/** The first day of the period that holds `day` (for a week, the Sunday of `weekStart`). */
export const periodStart = (grain: Grain, day: DayKey): DayKey => periodAt(grain, periodIndex(grain, day))

/** The start of the period `count` periods after the one holding `day` (before it, when negative). */
export const shiftPeriod = (grain: Grain, day: DayKey, count: number): DayKey =>
  periodAt(grain, periodIndex(grain, day) + count)

/** The last day of the period that holds `day`. */
export const periodEnd = (grain: Grain, day: DayKey): DayKey =>
  fromEpoch(toEpoch(periodAt(grain, periodIndex(grain, day) + 1)) - 1)

const earlier = (a: DayKey, b: DayKey): DayKey => (a < b ? a : b)

/** A picked range in order and not past today. */
function clampRange({ from, to }: DayRange, today: DayKey): DayRange {
  const [first, last] = from <= to ? [from, to] : [to, from]
  return { from: earlier(first, today), to: earlier(last, today) }
}

/**
 * The periods on screen: the latest ones up to today, or those of a picked range, ending where the arrows
 * moved them (`end`). Without a picked range, the year view shows every year since `earliest`, the first day
 * with data. Periods are whole: a picked range grows to the weeks or months that hold its first and last days.
 */
export function periodWindow(choice: PeriodChoice, today: DayKey, end?: DayKey, earliest?: DayKey): PeriodWindow {
  const { grain } = choice
  const fixed = grain === 'year' && !choice.custom
  let first: number
  let last: number
  if (fixed) {
    first = periodIndex(grain, earliest && earliest < today ? earliest : today)
    last = periodIndex(grain, today)
  } else {
    const range = choice.custom && clampRange(choice.custom, today)
    const count = range
      ? Math.min(periodIndex(grain, range.to) - periodIndex(grain, range.from) + 1, MAX_PERIODS)
      : choice.lengths[grain as LengthGrain]
    last = periodIndex(grain, earlier(end ?? range?.to ?? today, today))
    first = last - count + 1
  }
  const buckets: Bucket[] = []
  let start = periodAt(grain, first)
  for (let index = first; index <= last; index++) {
    const next = periodAt(grain, index + 1)
    buckets.push({ start, end: fromEpoch(toEpoch(next) - 1) })
    start = next
  }
  return { grain, buckets, from: buckets[0].start, to: earlier(buckets[buckets.length - 1].end, today), today, fixed }
}

/** Where the window ends after moving it by `steps` windows (−1 back, 1 forward); never past today. */
export function shiftWindow(window: PeriodWindow, steps: number): DayKey {
  const { grain, buckets, today } = window
  const target = periodIndex(grain, buckets[buckets.length - 1].start) + steps * buckets.length
  return target >= periodIndex(grain, today) ? today : periodEnd(grain, periodAt(grain, target))
}

/** Whether the window can move forward: its last period isn't the one holding today. */
export function canGoForward(window: PeriodWindow): boolean {
  const last = window.buckets[window.buckets.length - 1].start
  return !window.fixed && periodIndex(window.grain, last) < periodIndex(window.grain, window.today)
}

/** Whether there is data before the window (always, while the first day with data isn't known). */
export const canGoBack = (window: PeriodWindow, earliest?: DayKey): boolean =>
  !window.fixed && (earliest === undefined || earliest < window.from)

/** The items of each period of the window, by their day; items outside the window are left out. */
export function groupByPeriod<T>(window: PeriodWindow, items: readonly T[], dayOf: (item: T) => DayKey): T[][] {
  const groups = window.buckets.map((): T[] => [])
  const first = periodIndex(window.grain, window.from)
  for (const item of items) {
    const day = dayOf(item)
    if (day < window.from || day > window.to) continue
    groups[periodIndex(window.grain, day) - first].push(item)
  }
  return groups
}

/**
 * How a period sums up its days: the average of the readings (weight, sleep), the total (km, volume), the
 * average per day with data (steps, calories: several entries of a day add up first) or the best (a 1RM).
 */
export type Aggregate = 'mean' | 'sum' | 'perDay' | 'max'

export interface BucketValue extends Bucket {
  /** Undefined when the period has no data. */
  value?: number
  /** Values that went into it. */
  count: number
  /** Days with data. */
  days: number
}

/** One value per period of the window. In the day view each period is one day, so a day's values add up or average. */
export function aggregate(window: PeriodWindow, values: readonly DayValue[], how: Aggregate): BucketValue[] {
  return groupByPeriod(window, values, (value) => value.date).map((group, i) => {
    const bucket = window.buckets[i]
    if (group.length === 0) return { ...bucket, count: 0, days: 0 }
    let total = 0
    let best = -Infinity
    for (const point of group) {
      total += point.value
      best = Math.max(best, point.value)
    }
    const days = new Set(group.map((point) => point.date)).size
    const value = how === 'sum' ? total : how === 'mean' ? total / group.length : how === 'perDay' ? total / days : best
    return { ...bucket, value, count: group.length, days }
  })
}

/**
 * Each period's goal from each day's goal: their average over the days with data (a week is measured against
 * the goals of the days it was logged), or over all its days when none has data.
 */
export function periodGoals(
  window: PeriodWindow,
  goals: readonly DayValue[],
  withData: ReadonlySet<DayKey>,
): (number | undefined)[] {
  return groupByPeriod(window, goals, (goal) => goal.date).map((group) => {
    const logged = group.filter((goal) => withData.has(goal.date))
    const days = logged.length > 0 ? logged : group
    return days.length > 0 ? days.reduce((total, goal) => total + goal.value, 0) / days.length : undefined
  })
}

type Noun = readonly [singular: string, plural: string]

const plural = (count: number, [one, many]: Noun): string => `${count} ${count === 1 ? one : many}`

const UNITS: Record<Grain, Noun> = {
  day: ['dia', 'dias'],
  week: ['semana', 'semanas'],
  month: ['mês', 'meses'],
  year: ['ano', 'anos'],
}

/** "1 dia", "12 semanas", "6 meses". */
export const countLabel = (grain: Grain, count: number): string => plural(count, UNITS[grain])

/** The period as tooltips and tables name it: "quinta, 5 de nov", "semana de 1/11", "nov 2026", "2026". */
export function periodTitle(grain: Grain, start: DayKey, today: DayKey): string {
  const otherYear = start.slice(0, 4) !== today.slice(0, 4)
  switch (grain) {
    case 'day':
      return formatDay(start, otherYear ? "EEE, d 'de' MMM 'de' yyyy" : "EEE, d 'de' MMM")
    case 'week':
      return `semana de ${formatDay(start, otherYear ? 'd/M/yy' : 'd/M')}`
    case 'month':
      return formatDay(start, 'MMM yyyy')
    case 'year':
      return start.slice(0, 4)
  }
}

/** Axis labels: "5/11" for days and weeks, "nov" for months ("nov/25" when the window spans years), "2026". */
export function axisLabel(window: PeriodWindow, start: DayKey): string {
  switch (window.grain) {
    case 'day':
    case 'week':
      return formatDay(start, 'd/M')
    case 'month':
      return formatDay(start, window.from.slice(0, 4) === window.to.slice(0, 4) ? 'MMM' : 'MMM/yy')
    case 'year':
      return start.slice(0, 4)
  }
}

/** The days a window covers: "7 set – 6 out", "dez 2025 – nov 2026", "2024 – 2026" (this year goes unsaid). */
export function rangeLabel(window: PeriodWindow): string {
  const { grain, from, to, today } = window
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  const thisYear = sameYear && to.slice(0, 4) === today.slice(0, 4)
  const span = (a: string, b: string) => (a === b ? b : `${a} – ${b}`)
  if (grain === 'year') return span(from.slice(0, 4), to.slice(0, 4))
  const [short, long] = grain === 'month' ? ['MMM', 'MMM yyyy'] : ['d MMM', 'd MMM yyyy']
  return span(formatDay(from, sameYear ? short : long), formatDay(to, thisYear ? short : long))
}

const LATEST: Record<Grain, string> = { day: 'Últimos', week: 'Últimas', month: 'Últimos', year: 'Últimos' }

/** The window's headline and detail: "Últimos 30 dias" over its dates while it ends today, else its dates over its length. */
export function windowTitle(window: PeriodWindow, custom: boolean): { title: string; detail: string } {
  const range = rangeLabel(window)
  if (window.fixed) return { title: 'Todos os anos', detail: range }
  const length = countLabel(window.grain, window.buckets.length)
  if (!custom && !canGoForward(window)) return { title: `${LATEST[window.grain]} ${length}`, detail: range }
  return { title: range, detail: length }
}

const OF_PERIOD: Record<Grain, string> = { day: 'do dia', week: 'da semana', month: 'do mês', year: 'do ano' }

/**
 * What a period's value is, for tooltips and tables: "média de 5 pesagens", "média por dia · 6 dias",
 * "total · 3 corridas", "melhor do mês". Nothing for a single day.
 */
export function aggregateNote(how: Aggregate, grain: Grain, bucket: BucketValue, noun: Noun = UNITS.day): string {
  if (grain === 'day' || bucket.count === 0) return ''
  switch (how) {
    case 'mean':
      return `média de ${plural(bucket.count, noun)}`
    case 'perDay':
      return `média por dia · ${plural(bucket.days, noun)}`
    case 'sum':
      return `total · ${plural(bucket.count, noun)}`
    case 'max':
      return `melhor ${OF_PERIOD[grain]}`
  }
}

const EACH: Record<Grain, string> = { day: 'dia a dia', week: 'semana a semana', month: 'mês a mês', year: 'ano a ano' }

/** A chart's name for screen readers: "Água bebida, semana a semana, 9 ago – 5 nov". */
export const chartLabel = (label: string, window: PeriodWindow): string => `${label}, ${EACH[window.grain]}, ${rangeLabel(window)}`

const isDay = (value: unknown): value is DayKey => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/** A remembered choice, keeping only what still makes sense (an old or broken one falls back to the default). */
export function parseChoice(raw: unknown, fallback: PeriodChoice): PeriodChoice {
  if (!raw || typeof raw !== 'object') return fallback
  const saved = raw as { grain?: unknown; lengths?: Partial<Record<LengthGrain, unknown>>; custom?: Partial<Record<keyof DayRange, unknown>> }
  const grain = GRAINS.find((option) => option.value === saved.grain)?.value ?? fallback.grain
  const lengths = { ...fallback.lengths }
  for (const key of Object.keys(LENGTHS) as LengthGrain[]) {
    const value = saved.lengths?.[key]
    if (typeof value === 'number' && LENGTHS[key].includes(value)) lengths[key] = value
  }
  const from = saved.custom?.from
  const to = saved.custom?.to
  return isDay(from) && isDay(to) ? { grain, lengths, custom: { from, to } } : { grain, lengths }
}
