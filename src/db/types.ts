import type { DayKey } from '../lib/dates'

/** Fields every synced row carries. Booleans are 0/1 because IndexedDB can't index them. */
export interface Synced {
  id: string
  /** Client timestamp (ms) of the last change; the newest change wins on sync. */
  updatedAt: number
  deleted: 0 | 1
  /** 1 while the change hasn't reached the server. */
  dirty: 0 | 1
}

export interface WeightEntry extends Synced {
  date: DayKey
  time: number
  weightKg: number
  bodyFatPct?: number
  muscleMassKg?: number
  bodyWaterPct?: number
  visceralFat?: number
  boneMassKg?: number
  bmrKcal?: number
  source: 'manual' | 'health-connect'
  note?: string
}

export interface MeasurementEntry extends Synced {
  date: DayKey
  /** Centimeters by measurement site key. */
  values: Record<string, number>
  note?: string
}

export type ContainerIcon = 'glass' | 'bottle' | 'mug' | 'cup'

export interface WaterContainer extends Synced {
  name: string
  ml: number
  icon: ContainerIcon
  favorite: 0 | 1
  order: number
}

export interface WaterLog extends Synced {
  date: DayKey
  time: number
  ml: number
  containerId?: string
}

export interface Habit extends Synced {
  name: string
  /** "check" is done/not done; "count" records a quantity (cups, doses…). */
  kind: 'check' | 'count'
  unit?: string
  /** "good" habits are goals to meet; "bad" ones are things to avoid. */
  polarity: 'good' | 'bad'
  /** For count habits: the daily goal (good) or the daily limit (bad). */
  target?: number
  startDate: DayKey
  archived: 0 | 1
  order: number
}

export interface HabitLog extends Synced {
  /** Always `${habitId}:${date}`, so two devices logging the same day converge. */
  id: string
  habitId: string
  date: DayKey
  value: number
}

export interface MeasurementSite {
  key: string
  label: string
}

export interface Settings extends Synced {
  waterGoalMl: number
  measurementSites: MeasurementSite[]
}

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'adductors'
  | 'calves'
  | 'full_body'
  | 'cardio'

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'smith'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'other'

/** How a set is recorded: load × reps, reps only (body weight), or a duration. */
export type ExerciseType = 'weight_reps' | 'reps' | 'time'

export interface Exercise extends Synced {
  name: string
  muscle: MuscleGroup
  equipment: Equipment
  type: ExerciseType
  notes?: string
}

/** Warm-up sets don't count toward volume, weekly sets or records. */
export type SetKind = 'warmup' | 'normal'

/** A set as planned in a template; `repsMax` turns `reps` into a range (8–12). */
export interface PlannedSet {
  kind: SetKind
  reps?: number
  repsMax?: number
  weightKg?: number
  durationSec?: number
}

export interface TemplateExercise {
  key: string
  exerciseId: string
  restSec: number
  notes?: string
  sets: PlannedSet[]
}

export interface WorkoutTemplate extends Synced {
  name: string
  notes?: string
  exercises: TemplateExercise[]
  order: number
}

export interface PerformedSet {
  key: string
  kind: SetKind
  /** What the template asked for, when the set came from one. */
  target?: Omit<PlannedSet, 'kind'>
  weightKg?: number
  reps?: number
  durationSec?: number
  done: boolean
  /** When the set was checked off; lines it up with the watch's heart rate later. */
  completedAt?: number
}

export interface SessionExercise {
  key: string
  exerciseId: string
  restSec: number
  notes?: string
  sets: PerformedSet[]
}

export interface WorkoutSession extends Synced {
  templateId?: string
  name: string
  date: DayKey
  startedAt: number
  /** Unset while the workout is in progress. */
  endedAt?: number
  exercises: SessionExercise[]
  notes?: string
}
