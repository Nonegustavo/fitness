import { shiftDay, type DayKey } from '../../lib/dates'
import { availableMetrics, formatMetric, type DailyData, type Metric, type MetricGroup } from './metrics'
import { benjaminiHochberg, mean, median, spearman, welch } from './stats'

export interface Point {
  day: DayKey
  x: number
  y: number
}

/** What happens during a day meets the night that follows it, dated the next day. */
export const lagFor = (x: Metric, y: Metric): 0 | 1 => (x.timing === 'day' && y.timing === 'night' ? 1 : 0)

/** Each row's next day, worked out once per data: the highlights pair hundreds of measures over the same days. */
const nextDays = new WeakMap<DailyData, Map<DayKey, DayKey>>()

function nextDay(data: DailyData, day: DayKey): DayKey {
  let days = nextDays.get(data)
  if (!days) {
    days = new Map()
    nextDays.set(data, days)
  }
  let next = days.get(day)
  if (next === undefined) {
    next = shiftDay(day, 1)
    days.set(day, next)
  }
  return next
}

/** Days with both values: x on its day, y on the same day or the next night. */
export function pairPoints(data: DailyData, x: Metric, y: Metric): Point[] {
  const lag = lagFor(x, y)
  const points: Point[] = []
  for (const [day, row] of data.rows) {
    const xValue = row[x.key]
    if (xValue === undefined) continue
    const yValue = (lag ? data.rows.get(nextDay(data, day)) : row)?.[y.key]
    if (yValue !== undefined) points.push({ day, x: xValue, y: yValue })
  }
  return points.sort((a, b) => a.day.localeCompare(b.day))
}

/** Fewer days than this in either group, and any difference is mostly luck. */
export const MIN_GROUP = 5
export const MIN_POINTS = 12
/** Under this many days a relation found can still change a lot with more data. */
export const FEW_DAYS = 30

interface FindingBase {
  x: Metric
  y: Metric
  lag: 0 | 1
  n: number
  p: number
  /** Benjamini–Hochberg q-value, among all pairs tested together. */
  q?: number
  /** |Cohen's d| for groups, |Spearman ρ| for trends. */
  strength: number
}

export interface GroupFinding extends FindingBase {
  kind: 'groups'
  withMean: number
  withoutMean: number
  nWith: number
  nWithout: number
}

export interface TrendFinding extends FindingBase {
  kind: 'trend'
  rho: number
  /** The median of x, splitting the days in a "more" and a "less" half. */
  split: number
  highMean: number
  lowMean: number
}

export type Finding = GroupFinding | TrendFinding

export function analyze(data: DailyData, x: Metric, y: Metric): Finding | undefined {
  const points = pairPoints(data, x, y)
  const lag = lagFor(x, y)
  if (x.binary) {
    const yes = points.filter((point) => point.x > 0).map((point) => point.y)
    const no = points.filter((point) => point.x <= 0).map((point) => point.y)
    if (yes.length < MIN_GROUP || no.length < MIN_GROUP) return undefined
    const { p, d } = welch(yes, no)
    return {
      kind: 'groups',
      x,
      y,
      lag,
      n: points.length,
      p,
      strength: Math.abs(d),
      withMean: mean(yes),
      withoutMean: mean(no),
      nWith: yes.length,
      nWithout: no.length,
    }
  }
  const xs = points.map((point) => point.x)
  if (points.length < MIN_POINTS || new Set(xs).size < 5) return undefined
  const { rho, p } = spearman(xs, points.map((point) => point.y))
  // A round split reads better ("depois das 23:30"), as long as each side keeps a quarter of the days.
  const middle = median(xs)
  const rounded = roundSplit(x, middle)
  const above = xs.filter((v) => v > rounded).length
  const split = Math.min(above, xs.length - above) >= xs.length / 4 ? rounded : middle
  const high = points.filter((point) => point.x > split).map((point) => point.y)
  const low = points.filter((point) => point.x <= split).map((point) => point.y)
  if (high.length === 0 || low.length === 0) return undefined
  return { kind: 'trend', x, y, lag, n: points.length, p, strength: Math.abs(rho), rho, split, highMean: mean(high), lowMean: mean(low) }
}

/** A median as a number that reads well: whole quarter hours, 5 minutes or seconds, two significant digits. */
export function roundSplit(metric: Metric, value: number): number {
  if (metric.unit === 'clock' || metric.unit === 'h') return Math.round(value * 4) / 4
  if (metric.unit === 'min' || metric.unit === 'pace') return Math.round(value / 5) * 5
  if (value === 0) return 0
  const step = 10 ** (Math.floor(Math.log10(Math.abs(value))) - 1)
  return Math.round(value / step) * step
}

/** An effect computed from the cause (the readiness from the sleep, say): the relation would be the formula's. */
const computedFrom = (effect: Metric, cause: Metric): boolean =>
  !!effect.madeOf && (!!effect.madeOf.keys?.includes(cause.key) || !!effect.madeOf.groups?.includes(cause.group))

/** What is known as a night begins: when it started, and how far that was from the usual time. */
const OWN_NIGHT = new Set(['bedtime', 'bedtimeShift'])

/**
 * The pairs worth testing: a day against the next night or morning, a night or morning against the day
 * after it, the bedtime (and how far it was from the usual one) against its own night, and a run's
 * weather against that same run. A day against the same day mostly finds things measured twice.
 */
export function testable(x: Metric, y: Metric): boolean {
  if (x.key === y.key || !x.cause || !y.effect || computedFrom(y, x)) return false
  if (x.condition) return y.during !== undefined && y.during === x.during
  return (x.timing === 'day' && y.timing === 'night') || (x.timing === 'night' && y.timing === 'day') || OWN_NIGHT.has(x.key)
}

const MIN_STRENGTH = { groups: 0.3, trend: 0.2 }
/** Cohen's usual lines for a moderate and a strong relation: d for groups, ρ for trends. */
const MODERATE = { groups: 0.5, trend: 0.3 }
const STRONG = { groups: 0.8, trend: 0.5 }
const MAX_Q = 0.1
const MAX_PER_CAUSE = 2

/** d and ρ aren't on one scale: the label first, then the strength as a share of the "forte" line. */
export function strongestFirst(a: Finding, b: Finding): number {
  const tier = (finding: Finding) => ['fraca', 'moderada', 'forte'].indexOf(strengthLabel(finding))
  return tier(b) - tier(a) || b.strength / STRONG[b.kind] - a.strength / STRONG[a.kind]
}

/** The clearest relations in the data: tested together, kept only when unlikely to be chance. */
export function highlights(data: DailyData, limit = 6): Finding[] {
  const metrics = availableMetrics(data, MIN_GROUP)
  const findings: Finding[] = []
  for (const x of metrics) {
    for (const y of metrics) {
      if (!testable(x, y)) continue
      const finding = analyze(data, x, y)
      if (finding) findings.push(finding)
    }
  }
  const q = benjaminiHochberg(findings.map((finding) => finding.p))
  const kept = findings
    .map((finding, i) => ({ ...finding, q: q[i] }))
    .filter((finding) => finding.q <= MAX_Q && finding.strength >= MIN_STRENGTH[finding.kind])
    .sort(strongestFirst)
  // Two per cause come first, so one habit (or bedtime) can't fill the list; the rest fill any room left.
  const perCause = new Map<string, number>()
  const first = kept.filter((finding) => {
    const count = perCause.get(finding.x.key) ?? 0
    perCause.set(finding.x.key, count + 1)
    return count < MAX_PER_CAUSE
  })
  return [...first, ...kept.filter((finding) => !first.includes(finding))].slice(0, limit)
}

/** The findings by what they explain (sleep, recovery, the runs…): the strongest first, in each group and among them. */
export function byEffect(findings: Finding[]): { group: MetricGroup; findings: Finding[] }[] {
  const groups = new Map<MetricGroup, Finding[]>()
  for (const finding of [...findings].sort(strongestFirst)) {
    const list = groups.get(finding.y.group)
    if (list) list.push(finding)
    else groups.set(finding.y.group, [finding])
  }
  return [...groups].map(([group, list]) => ({ group, findings: list }))
}

export function strengthLabel(finding: Finding): 'forte' | 'moderada' | 'fraca' {
  if (finding.strength >= STRONG[finding.kind]) return 'forte'
  return finding.strength >= MODERATE[finding.kind] ? 'moderada' : 'fraca'
}

/** When y is measured, relative to x. */
export function timingNote(x: Metric, y: Metric): string {
  if (x.condition) return 'na mesma corrida'
  if (lagFor(x, y) === 1) return y.morning ? 'na manhã seguinte' : 'na noite seguinte'
  if (x.timing === 'night' && y.timing === 'day') return x.morning ? 'no mesmo dia' : 'no dia seguinte à noite'
  if (x.timing === 'day') return 'no mesmo dia'
  return x.morning && y.morning ? 'na mesma manhã' : 'na mesma noite'
}

// Acronyms (HRV, FC, REM, RIR) and Garmin's "Body Battery" keep their capitals mid-sentence.
const KEEP_CASE = /^(?:[A-ZÀ-Ý]{2,}\b|Body Battery)/
export const lowerFirst = (label: string) =>
  KEEP_CASE.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1)

/** One plain sentence with the two averages, so the number speaks for itself. */
export function describe(finding: Finding): string {
  const { x, y } = finding
  const fy = (value: number) => formatMetric(y, value)
  // "HRV da noite de 52 ms", or number first where it reads better: "20% dos treinos com desconforto".
  const amount = (value: number) => (y.noun ? `${fy(value)} ${y.noun}` : `${lowerFirst(y.label)} de ${fy(value)}`)
  if (finding.kind === 'groups') {
    const lead = x.timing === y.timing && !lagFor(x, y) ? 'Em' : 'Depois de'
    return `${lead} ${x.phrase ?? lowerFirst(x.label)}: ${amount(finding.withMean)}, contra ${fy(finding.withoutMean)} nos outros dias.`
  }
  const when = timingNote(x, y)
  const high = amount(finding.highMean)
  const low = fy(finding.lowMean)
  const split = formatMetric(x, finding.split)
  if (x.key === 'bedtime') return `Dormindo depois das ${split}: ${high} ${when}; antes disso, ${low}.`
  if (x.key === 'wakeTime') return `Acordando depois das ${split}: ${high} ${when}; antes disso, ${low}.`
  if (x.key === 'lastMeal') return `Comendo depois das ${split}: ${high} ${when}; comendo antes, ${low}.`
  if (x.condition) return `${x.label} acima de ${split}: ${high}; nas outras corridas, ${low}.`
  // A pace above another is a slower one.
  const above = finding.split === 0 ? 'acima de zero' : x.unit === 'pace' ? `mais lento que ${split}` : `acima de ${split}`
  return `${x.label} ${above}: ${high} ${when}; nos outros dias, ${low}.`
}
