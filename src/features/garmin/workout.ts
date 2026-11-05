import type { PlannedStep, PlannedWorkout } from '../../db/types'
import { formatClock, formatNumber } from '../../lib/format'

/** A workout as the Personal API describes it (`/activity-service/activity/{id}/workouts`). */
export interface GarminWorkout {
  workoutName?: string
  steps?: {
    stepIndex?: number
    name?: string
    notes?: string
    intensity?: string
    durationType?: string
    durationValue?: number
    targetType?: string
    targetValue?: number
    targetValueLow?: number
    targetValueHigh?: number
  }[]
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

/** The first workout with steps, in the app's shape. */
export function toPlannedWorkout(workouts: GarminWorkout[] | null | undefined): PlannedWorkout | undefined {
  const workout = workouts?.find((candidate) => (candidate.steps?.length ?? 0) > 0)
  if (!workout?.steps) return undefined
  return {
    name: text(workout.workoutName),
    steps: workout.steps.map((step, i) => {
      const fields: PlannedStep = {
        index: num(step.stepIndex) ?? i,
        name: text(step.name),
        notes: text(step.notes),
        intensity: text(step.intensity)?.toUpperCase(),
        durationType: text(step.durationType)?.toUpperCase(),
        durationValue: num(step.durationValue),
        targetType: text(step.targetType)?.toUpperCase(),
        targetValue: num(step.targetValue),
        targetLow: num(step.targetValueLow),
        targetHigh: num(step.targetValueHigh),
      }
      // Without the empty fields, so the row stays small and compares cleanly.
      return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as PlannedStep
    }),
  }
}

export type WorkoutBlock = { kind: 'step'; step: PlannedStep } | { kind: 'repeat'; times: number; steps: PlannedStep[] }

export const isRepeat = (step: PlannedStep): boolean => step.durationType?.startsWith('REPEAT') ?? false

/** Steps grouped as the watch runs them: a repeat wraps the steps from the one it points back to. */
export function workoutBlocks(steps: PlannedStep[]): WorkoutBlock[] {
  const blocks: WorkoutBlock[] = []
  for (const step of steps) {
    if (!isRepeat(step)) {
      blocks.push({ kind: 'step', step })
      continue
    }
    const from = step.durationValue ?? 0
    const inner: PlannedStep[] = []
    while (blocks.length > 0) {
      const last = blocks[blocks.length - 1]
      if (last.kind !== 'step' || last.step.index < from) break
      inner.unshift(last.step)
      blocks.pop()
    }
    blocks.push({ kind: 'repeat', times: Math.max(1, Math.round(step.targetValue ?? 1)), steps: inner })
  }
  return blocks
}

const INTENSITY: Record<string, string> = {
  WARMUP: 'Aquecimento',
  COOLDOWN: 'Desaquecimento',
  RECOVERY: 'Recuperação',
  REST: 'Descanso',
  ACTIVE: 'Esforço',
  INTERVAL: 'Esforço',
}

/** 300 -> "5 min", 90 -> "1:30". */
const stepTime = (seconds: number) => (seconds % 60 === 0 ? `${seconds / 60} min` : formatClock(seconds))

/** 800 -> "800 m", 1000 -> "1 km", 1500 -> "1,5 km". */
const stepDistance = (meters: number) => (meters < 1000 ? `${Math.round(meters)} m` : `${formatNumber(meters / 1000, 2)} km`)

/** Garmin's heart rate targets: up to 100 is % of max, above it bpm + 100. */
const heartRate = (value: number) => (value > 100 ? `${Math.round(value - 100)} bpm` : `${Math.round(value)}% da máx.`)

/** Power targets: up to 1000 is % of FTP, above it watts + 1000. */
const power = (value: number) => (value > 1000 ? `${Math.round(value - 1000)} W` : `${Math.round(value)}% do FTP`)

/** How long a step lasts: "10 min", "800 m", "até apertar volta". */
export function stepDuration(step: PlannedStep): string | undefined {
  const value = step.durationValue
  switch (step.durationType) {
    case 'TIME':
      return value ? stepTime(value) : undefined
    case 'DISTANCE':
      return value ? stepDistance(value) : undefined
    case 'REPS':
      return value ? `${value} repetições` : undefined
    case 'CALORIES':
      return value ? `${value} kcal` : undefined
    case 'HR_LESS_THAN':
      return value ? `até a FC baixar de ${heartRate(value)}` : undefined
    case 'HR_GREATER_THAN':
      return value ? `até a FC passar de ${heartRate(value)}` : undefined
    case 'OPEN':
      return 'até apertar volta'
    default:
      return undefined
  }
}

/** "4:30–4:40 /km", "FC 140–150 bpm", "zona 2 de FC". On foot, speeds read as pace. */
export function stepTarget(step: PlannedStep, foot: boolean): string | undefined {
  const { targetType: type, targetLow: low, targetHigh: high, targetValue: zone } = step
  if (!type || type === 'OPEN' || type === 'NO_TARGET') return undefined
  const range = (format: (v: number) => string) =>
    low !== undefined && high !== undefined && (low > 0 || high > 0) ? `${format(low)}–${format(high)}` : undefined
  const zoned = (what: string) => (zone ? `zona ${zone} de ${what}` : undefined)
  switch (type) {
    case 'SPEED':
    case 'PACE': {
      if (low && high) {
        if (!foot) return `${formatNumber(low * 3.6, 1)}–${formatNumber(high * 3.6, 1)} km/h`
        // Faster speed is the smaller pace, so the range flips.
        return `${formatClock(1000 / high)}–${formatClock(1000 / low)} /km`
      }
      return zoned('ritmo')
    }
    case 'HEART_RATE': {
      const bpm = low !== undefined && high !== undefined && low > 100 && high > 100
      const span = range((v) => String(Math.round(bpm ? v - 100 : v)))
      if (span) return `FC ${span}${bpm ? ' bpm' : '% da máx.'}`
      return zoned('FC')
    }
    case 'CADENCE': {
      const span = range((v) => String(Math.round(v)))
      return span ? `cadência ${span}` : zoned('cadência')
    }
    case 'POWER': {
      const span = range(power)
      return span ? `potência ${span}` : zoned('potência')
    }
    default:
      return undefined
  }
}

/** A step as one line: its name, then how long and how hard. */
export function describeStep(step: PlannedStep, foot: boolean): { title: string; detail: string } {
  const title = step.name ?? (step.intensity && INTENSITY[step.intensity]) ?? 'Etapa'
  const detail = [stepDuration(step), stepTarget(step, foot)].filter(Boolean).join(' · ')
  return { title, detail }
}
