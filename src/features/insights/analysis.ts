import { shiftDay, type DayKey } from '../../lib/dates'
import { availableMetrics, formatMetric, type DailyData, type Metric } from './metrics'
import { benjaminiHochberg, mean, median, spearman, welch } from './stats'

export interface Point {
  day: DayKey
  x: number
  y: number
}

/** What happens during a day meets the night that follows it, dated the next day. */
export const lagFor = (x: Metric, y: Metric): 0 | 1 => (x.timing === 'day' && y.timing === 'night' ? 1 : 0)

/** Days with both values: x on its day, y on the same day or the next night. */
export function pairPoints(data: DailyData, x: Metric, y: Metric): Point[] {
  const lag = lagFor(x, y)
  const points: Point[] = []
  for (const [day, row] of data.rows) {
    const xValue = row[x.key]
    if (xValue === undefined) continue
    const yValue = data.rows.get(lag ? shiftDay(day, lag) : day)?.[y.key]
    if (yValue !== undefined) points.push({ day, x: xValue, y: yValue })
  }
  return points.sort((a, b) => a.day.localeCompare(b.day))
}

/** Fewer days than this in either group, and any difference is mostly luck. */
export const MIN_GROUP = 5
export const MIN_POINTS = 12

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

/** A median as a number that reads well: whole quarter hours, 5 minutes, two significant digits. */
export function roundSplit(metric: Metric, value: number): number {
  if (metric.unit === 'clock' || metric.unit === 'h') return Math.round(value * 4) / 4
  if (metric.unit === 'min') return Math.round(value / 5) * 5
  if (value === 0) return 0
  const step = 10 ** (Math.floor(Math.log10(Math.abs(value))) - 1)
  return Math.round(value / step) * step
}

/**
 * The pairs worth testing: a day against the next night, a night against the day after it,
 * and bedtime against its own night. A day against the same day mostly finds things measured twice.
 */
function testable(x: Metric, y: Metric): boolean {
  if (x.key === y.key || !x.cause || !y.effect) return false
  return (x.timing === 'day' && y.timing === 'night') || (x.timing === 'night' && y.timing === 'day') || x.key === 'bedtime'
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

export function strengthLabel(finding: Finding): 'forte' | 'moderada' | 'fraca' {
  if (finding.strength >= STRONG[finding.kind]) return 'forte'
  return finding.strength >= MODERATE[finding.kind] ? 'moderada' : 'fraca'
}

/** When y is measured, relative to x. */
export function timingNote(x: Metric, y: Metric): string {
  if (lagFor(x, y) === 1) return 'na noite seguinte'
  if (x.timing === 'night' && y.timing === 'day') return 'no dia seguinte à noite'
  return 'na mesma noite'
}

// Acronyms (HRV, FC, REM) and Garmin's "Body Battery" keep their capitals mid-sentence.
const KEEP_CASE = /^(?:[A-ZÀ-Ý]{2,}\b|Body Battery)/
export const lowerFirst = (label: string) =>
  KEEP_CASE.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1)

/** One plain sentence with the two averages, so the number speaks for itself. */
export function describe(finding: Finding): string {
  const { x, y } = finding
  const what = lowerFirst(y.label)
  const fy = (value: number) => formatMetric(y, value)
  if (finding.kind === 'groups') {
    return `Depois de ${x.phrase ?? lowerFirst(x.label)}: ${what} de ${fy(finding.withMean)}, contra ${fy(finding.withoutMean)} nos outros dias.`
  }
  const when = timingNote(x, y)
  if (x.key === 'bedtime') {
    return `Dormindo depois das ${formatMetric(x, finding.split)}: ${what} de ${fy(finding.highMean)} ${when}; antes disso, ${fy(finding.lowMean)}.`
  }
  if (x.key === 'lastMeal') {
    return `Comendo depois das ${formatMetric(x, finding.split)}: ${what} de ${fy(finding.highMean)} ${when}; comendo antes, ${fy(finding.lowMean)}.`
  }
  const above = finding.split === 0 ? 'acima de zero' : `acima de ${formatMetric(x, finding.split)}`
  return `${x.label} ${above}: ${what} de ${fy(finding.highMean)} ${when}; nos outros dias, ${fy(finding.lowMean)}.`
}
