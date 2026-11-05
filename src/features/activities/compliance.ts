import type { Activity, ActivityLap, PlannedStep } from '../../db/types'
import { describeStep, isRepeat } from '../garmin/workout'

/** One step as the watch runs it, with the repeats unrolled. */
export interface RunStep {
  step: PlannedStep
  /** Inside a repeat: which time through it (from 1) and of how many. */
  round?: number
  rounds?: number
}

/** Whether the lap lasted what the step asked (its time or distance). */
export type LengthCheck = 'ok' | 'short' | 'long'
/** Against the step's target: pace for a speed target, heart rate for a heart rate one. */
export type TargetCheck = 'ok' | 'fast' | 'slow' | 'high' | 'low'

export interface StepCheck extends RunStep {
  /** The lap the watch made for this step; none for a step not done. */
  lap?: ActivityLap
  length?: LengthCheck
  target?: TargetCheck
}

export interface WorkoutCheck {
  /**
   * aligned: a lap for every step; ended: the activity stopped before the last steps; mismatch:
   * the laps don't line up with the steps, so nothing is compared.
   */
  status: 'aligned' | 'ended' | 'mismatch'
  steps: StepCheck[]
  /** The activity's laps, and how many of them fell outside the workout (the watch kept recording). */
  laps: number
  extraLaps: number
}

/** A runaway repeat (bad data) stops here. */
const MAX_STEPS = 500
/** For a repeat "until a time" or such, the counts tried to match the laps. */
const MAX_GUESS = 60

/**
 * How many times a repeat runs, when it says (REPEAT_UNTIL_STEPS_CMPLT); undefined for one that goes
 * until a time, a distance…
 */
function repeatCount(step: PlannedStep): number | undefined {
  const type = step.durationType ?? ''
  if (type !== 'REPEAT' && !type.includes('STEPS')) return undefined
  const times = step.targetValue
  return times !== undefined && times >= 1 ? Math.round(times) : undefined
}

/**
 * The steps in the order the watch runs them: a repeat goes back to the step it points to until it
 * has run its count, nested repeats included. `guess` is the count of a repeat that has none. undefined
 * when the workout can't be unrolled (a repeat pointing nowhere, or without a count to use).
 */
export function unrollSteps(steps: PlannedStep[], guess?: number): RunStep[] | undefined {
  const position = new Map(steps.map((step, i) => [step.index, i]))
  const times = (repeat: PlannedStep) => repeatCount(repeat) ?? guess
  // The innermost repeat around each step (the nearest one after it that reaches back past it), for its round.
  const around = new Map<number, number>()
  steps.forEach((step, r) => {
    if (!isRepeat(step)) return
    const from = position.get(step.durationValue ?? -1)
    if (from === undefined || from >= r) return
    for (let p = from; p < r; p++) if (!around.has(p)) around.set(p, r)
  })

  const run: RunStep[] = []
  const passes = new Map<number, number>()
  let i = 0
  while (i < steps.length) {
    const step = steps[i]
    if (!isRepeat(step)) {
      const r = around.get(i)
      run.push(r === undefined ? { step } : { step, round: (passes.get(r) ?? 0) + 1, rounds: times(steps[r]) })
      if (run.length > MAX_STEPS) return undefined
      i++
      continue
    }
    const from = position.get(step.durationValue ?? -1)
    const count = times(step)
    if (from === undefined || from >= i || count === undefined) return undefined
    const done = (passes.get(i) ?? 0) + 1
    if (done < count) {
      passes.set(i, done)
      i = from
    } else {
      passes.delete(i)
      i++
    }
  }
  return run
}

/** The run of a workout for its laps: a repeat without a count (only one) gets the count that matches them. */
function unrollFor(steps: PlannedStep[], laps: number): RunStep[] | undefined {
  const open = steps.filter((step) => isRepeat(step) && repeatCount(step) === undefined).length
  if (open === 0) return unrollSteps(steps)
  if (open > 1) return undefined
  for (let guess = 1; guess <= MAX_GUESS; guess++) {
    const run = unrollSteps(steps, guess)
    if (!run || run.length > laps) return undefined
    if (run.length === laps) return run
  }
  return undefined
}

/**
 * Whether a lap lasted what its step asked. The watch ends a time or distance step right on it, so
 * a lap well short of it was cut (lap pressed, or the activity ended), and one well past it is a
 * sign the laps and steps aren't lined up.
 */
export function lengthCheck(step: PlannedStep, lap: ActivityLap): LengthCheck | undefined {
  const planned = step.durationValue
  if (!planned) return undefined
  let done: number | undefined
  let slack: number
  if (step.durationType === 'TIME') {
    done = lap.timerSec
    slack = Math.max(3, planned * 0.03)
  } else if (step.durationType === 'DISTANCE') {
    done = lap.distanceM
    slack = Math.max(15, planned * 0.03)
  } else return undefined
  if (done === undefined) return undefined
  return done < planned - slack ? 'short' : done > planned + slack ? 'long' : 'ok'
}

/**
 * A heart rate target in bpm: Garmin's values above 100 are bpm + 100 and up to 100 a share of the
 * maximum (the top of zone 5); a zone number reads the activity's zones.
 */
function heartRange(step: PlannedStep, zoneLimits: number[] | undefined): [number, number] | undefined {
  const { targetLow: low, targetHigh: high, targetValue: zone } = step
  if (low !== undefined && high !== undefined && (low > 0 || high > 0)) {
    const [lo, hi] = low <= high ? [low, high] : [high, low]
    if (lo > 100) return [lo - 100, hi - 100]
    const max = zoneLimits?.at(-1)
    if (hi > 100 || !max) return undefined
    return [Math.round((lo / 100) * max), Math.round((hi / 100) * max)]
  }
  if (zone && zoneLimits && zone >= 1 && zone < zoneLimits.length) return [zoneLimits[zone - 1] + 1, zoneLimits[zone]]
  return undefined
}

/**
 * A lap against its step's target. On foot the pace is compared as it reads, in whole seconds per
 * km, so a lap at 4:40 is inside "4:30–4:40 /km"; on a bike, the speed to a tenth of a km/h.
 */
export function targetCheck(step: PlannedStep, lap: ActivityLap, foot: boolean, zoneLimits?: number[]): TargetCheck | undefined {
  switch (step.targetType) {
    case 'SPEED':
    case 'PACE': {
      const { targetLow: low, targetHigh: high } = step
      const speed = lap.avgSpeed
      if (!low || !high || !speed || !lap.distanceM) return undefined
      const [slowest, fastest] = low <= high ? [low, high] : [high, low]
      const read = (value: number) => (foot ? -Math.round(1000 / value) : Math.round(value * 36))
      if (read(speed) > read(fastest)) return 'fast'
      if (read(speed) < read(slowest)) return 'slow'
      return 'ok'
    }
    case 'HEART_RATE': {
      const range = heartRange(step, zoneLimits)
      const hr = lap.avgHr
      if (!range || hr === undefined) return undefined
      return hr > range[1] ? 'high' : hr < range[0] ? 'low' : 'ok'
    }
    default:
      return undefined
  }
}

/** How many of the time and distance steps from `offset` on got a lap of their length. */
function fit(run: RunStep[], laps: ActivityLap[], offset: number): { checked: number; matched: number } {
  let checked = 0
  let matched = 0
  const count = Math.min(run.length, laps.length - offset)
  for (let i = 0; i < count; i++) {
    const length = lengthCheck(run[i].step, laps[offset + i])
    if (length === undefined) continue
    checked++
    if (length === 'ok') matched++
  }
  return { checked, matched }
}

/**
 * The planned workout step by step against the laps: when following a workout the watch makes one
 * lap per step, so the n-th step is the n-th lap. Laps beyond the steps are taken as recorded before
 * or after the workout (where they fit best); fewer laps, as the activity ending early. The pairing
 * has to hold up: at least half of the time and distance steps must have a lap of their length (or,
 * with none of those, as many laps as steps); otherwise it's a mismatch and nothing is judged.
 */
export function checkWorkout(activity: Pick<Activity, 'workout' | 'laps' | 'hrZones' | 'sport'>): WorkoutCheck | undefined {
  const steps = activity.workout?.steps
  if (!steps?.length) return undefined
  const laps = activity.laps
  const run = unrollFor(steps, laps.length)
  const mismatch: WorkoutCheck = { status: 'mismatch', steps: run ?? [], laps: laps.length, extraLaps: 0 }
  if (!run?.length || laps.length === 0) return mismatch

  let offset = 0
  let best = fit(run, laps, 0)
  for (let start = 1; start <= laps.length - run.length; start++) {
    const candidate = fit(run, laps, start)
    if (candidate.matched > best.matched) {
      best = candidate
      offset = start
    }
  }
  const done = Math.min(run.length, laps.length - offset)
  const holds = best.checked > 0 ? best.matched * 2 >= best.checked : laps.length === run.length
  if (!holds) return mismatch

  const foot = activity.sport === 'running' || activity.sport === 'walking' || activity.sport === 'hiking'
  const zones = activity.hrZones?.limits
  return {
    status: done < run.length ? 'ended' : 'aligned',
    laps: laps.length,
    extraLaps: laps.length - done,
    steps: run.map((item, i) => {
      if (i >= done) return item
      const lap = laps[offset + i]
      const length = lengthCheck(item.step, lap)
      const target = targetCheck(item.step, lap, foot, zones)
      return { ...item, lap, ...(length && { length }), ...(target && { target }) }
    }),
  }
}

const REST = new Set(['WARMUP', 'COOLDOWN', 'RECOVERY', 'REST'])

/** A step of effort (not warm-up, cool-down or recovery). */
export const isWork = (step: PlannedStep): boolean => !REST.has(step.intensity ?? '')

/** A step of effort inside a repeat: what runners call a "tiro". */
const isRep = (check: RunStep) => check.round !== undefined && isWork(check.step)

/** "Tiro 3/8", "Recuperação 3/8", "Aquecimento": a step by its name, and its round inside a repeat. */
export function stepLabel(check: RunStep, foot = true): string {
  const name = check.step.name ?? (isRep(check) ? 'Tiro' : describeStep(check.step, foot).title)
  return check.round === undefined ? name : `${name} ${check.round}/${check.rounds ?? '?'}`
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * The comparison in a line, for the screen, the coach and the analysis: "6 de 8 tiros no alvo (2
 * mais lentos)". It counts the effort steps with a target ("tiros" when they are all inside repeats,
 * else "etapas"), or every step with one when only warm-up and the like have targets; without any
 * target, the steps done. Cut steps and an early end are added.
 */
export function checkSummary(check: WorkoutCheck): string {
  if (check.status === 'mismatch') {
    if (check.steps.length === 0) return 'não deu para ler as repetições do treino'
    return `as voltas não batem com as etapas do treino (${plural(check.laps, 'volta', 'voltas')} para ${plural(check.steps.length, 'etapa', 'etapas')})`
  }
  const done = check.steps.filter((step) => step.lap)
  const judged = done.filter((step) => step.target)
  const work = judged.filter((step) => isWork(step.step))
  const counted = work.length > 0 ? work : judged
  const reps = counted.length > 0 && counted.every(isRep)
  const [one, many, male] = reps ? ['tiro', 'tiros', true] : ['etapa', 'etapas', false]
  const word = (count: number, masculine: string, feminine: string) => {
    const base = male ? masculine : feminine
    return count === 1 ? base : `${base}s`
  }

  const parts: string[] = []
  if (counted.length > 0) {
    const ok = counted.filter((step) => step.target === 'ok').length
    const off = (kind: TargetCheck) => counted.filter((step) => step.target === kind).length
    const misses = [
      off('slow') > 0 && `${off('slow')} mais ${word(off('slow'), 'lento', 'lenta')}`,
      off('fast') > 0 && `${off('fast')} mais ${word(off('fast'), 'rápido', 'rápida')}`,
      off('high') > 0 && `${off('high')} com FC acima`,
      off('low') > 0 && `${off('low')} com FC abaixo`,
    ].filter(Boolean)
    parts.push(`${ok} de ${counted.length} ${counted.length === 1 ? one : many} no alvo${misses.length ? ` (${misses.join(', ')})` : ''}`)
  } else if (check.status === 'aligned') {
    parts.push(check.steps.length === 1 ? 'a etapa foi feita' : `todas as ${check.steps.length} etapas feitas`)
  }

  const cut = done.filter((step) => step.length === 'short')
  if (cut.length > 0) {
    const repsCut = cut.every(isRep)
    parts.push(
      repsCut ? `${plural(cut.length, 'tiro encurtado', 'tiros encurtados')}` : `${plural(cut.length, 'etapa encurtada', 'etapas encurtadas')}`,
    )
  }
  if (check.status === 'ended') {
    const missing = check.steps.length - done.length
    parts.push(`treino encerrado antes do fim: ${missing === 1 ? 'faltou' : 'faltaram'} ${missing} de ${check.steps.length} etapas`)
  }
  return parts.join('; ')
}
