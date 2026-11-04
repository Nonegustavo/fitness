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
  /** Health Connect's lean body mass (everything but fat), which the Zepp app writes there. */
  leanMassKg?: number
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
  /** A notification in the Android app, on the chosen weekdays, while the day isn't logged yet. */
  reminder?: HabitReminder
}

export interface HabitReminder {
  /** "20:30", local time. */
  time: string
  /** 0 = Sunday … 6 = Saturday. */
  days: number[]
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

export interface MacroGoals {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** How the day went, in the user's words: one entry per day. */
export interface JournalEntry extends Synced {
  /** The day key. */
  id: DayKey
  text: string
  /** 1 (very bad) to 5 (great). */
  mood?: number
  /** 1 (exhausted) to 5 (full of energy). */
  energy?: number
}

/** One area of the daily analysis: what the data shows and what to do about it. */
export interface InsightSection {
  area: 'sono' | 'recuperacao' | 'treino' | 'alimentacao' | 'corpo' | 'habitos' | 'geral'
  title: string
  text: string
  tips: string[]
}

/** Claude's reading of the data and the diary, generated once a day and synced. */
export interface DailyInsight extends Synced {
  /** The day key. */
  id: DayKey
  createdAt: number
  model: string
  headline: string
  sections: InsightSection[]
}

/** A food photo kept on this device; `pending` until it reaches the server's storage. Not synced as a record. */
export interface PhotoBlob {
  id: string
  blob: Blob
  createdAt: number
  pending: 0 | 1
}

export type HomeCardId = 'insights' | 'sleep' | 'planned' | 'workout' | 'food' | 'body' | 'water' | 'habits' | 'journal'

/** The cards of the Hoje screen, as the user arranged them. Cards missing from `order` go last. */
export interface HomeLayout {
  order: HomeCardId[]
  hidden: HomeCardId[]
}

export interface Settings extends Synced {
  waterGoalMl: number
  measurementSites: MeasurementSite[]
  /** Daily targets; `training` applies on days with a workout, when set. */
  nutrition?: { normal: MacroGoals; training?: MacroGoals }
  home?: HomeLayout
  /** The daily analysis by Claude, made once a day on the first opening. On unless set to false. */
  insightsAuto?: boolean
  /** Where the weight is headed, and how fast (kg a week, negative to lose). */
  weightGoal?: WeightGoal
}

export interface WeightGoal {
  targetKg: number
  kgPerWeek: number
  /** The weight trend when the target was set, for the progress bar. */
  startKg?: number
}

/** Grams, except kcal. */
export interface Nutrients {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  /** Milligrams. */
  sodium?: number
  sugar?: number
  saturatedFat?: number
}

export interface Portion {
  label: string
  grams: number
}

/**
 * How a food is measured when it has no weight: in portions, as the foods that came from Health Connect
 * (it keeps what was eaten, never how much it weighed).
 */
export type FoodUnit = 'portion'

/**
 * A food the user created, imported by barcode or from Health Connect, or put together as a recipe. TACO
 * foods ship with the app instead.
 */
export interface Food extends Synced {
  name: string
  brand?: string
  barcode?: string
  /** Per 100 g (or 100 ml); per portion when `unit` is "portion". */
  per100: Nutrients
  portions?: Portion[]
  unit?: FoodUnit
  /** The values were typed per portion (the first one), as on the package label: the form shows them that way again. */
  labelPerPortion?: boolean
  source: 'custom' | 'openfoodfacts' | 'recipe' | 'health-connect'
  /** The TACO food this one replaces in searches: the user's own version of it. */
  basedOn?: string
  /** For recipes: what went in, with each food's values as they were when added. */
  ingredients?: RecipeIngredient[]
  /** For recipes: the weight once ready, when it differs from the ingredients' sum (water lost or absorbed). */
  yieldGrams?: number
}

export interface RecipeIngredient {
  foodId: string
  name: string
  grams: number
  per100: Nutrients
}

export type MealKey = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'supper'

export interface FoodLog extends Synced {
  date: DayKey
  meal: MealKey
  time: number
  /** "taco:123" or the id of a custom food. */
  foodId: string
  /** Copied when logged, so the entry survives later edits of the food. */
  name: string
  /** The amount: grams, or portions when `unit` is "portion". */
  grams: number
  unit?: FoodUnit
  /** The portion it was logged by ("1 fatia", 25 g), so the amount reads and edits as a count of it. */
  portion?: Portion
  /** For this amount, not per 100 g. */
  nutrients: Nutrients
  /** The plate photo it was logged from, shared by the items of that photo. */
  photoId?: string
}

/** Usage of any food, TACO ones included: favorite, last amount, last use. */
export interface FoodPref extends Synced {
  /** The food id. */
  id: string
  favorite: 0 | 1
  lastGrams?: number
  lastUsedAt?: number
  /** A 1-tap shortcut on the food screen (supplements, the daily coffee), with its amount. */
  quick?: QuickAmount
}

export interface QuickAmount {
  /** Grams, or portions for a food measured in portions. */
  grams: number
  /** Counted by the food's portion. */
  portion?: Portion
}

export interface SavedMealItem {
  foodId: string
  name: string
  grams: number
  unit?: FoodUnit
  portion?: Portion
  nutrients: Nutrients
}

/** A combination logged often ("café da manhã de sempre"), added in one tap. */
export interface SavedMeal extends Synced {
  name: string
  items: SavedMealItem[]
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
  /** Kept for later but out of the rotation, like an old program. */
  archived?: 0 | 1
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

/** One lap as the watch recorded it. Speeds in m/s, distances in meters. */
export interface ActivityLap {
  startTime: number
  elapsedSec: number
  timerSec: number
  distanceM?: number
  avgHr?: number
  maxHr?: number
  avgSpeed?: number
  avgCadence?: number
  avgPower?: number
  ascentM?: number
  /** "active", "rest", "warmup", "cooldown"… */
  intensity?: string
}

/** A strength set as the watch recorded it (its own detection, not the app's). */
export interface WatchSet {
  startTime: number
  durationSec: number
  reps?: number
  weightKg?: number
}

/**
 * One step of a structured workout, as Garmin describes it. Durations and targets only make
 * sense with their types: seconds for TIME, meters for DISTANCE; speeds in m/s; heart rate
 * as % of max or bpm + 100; power as % of FTP or watts + 1000. A REPEAT step sends back to
 * the step at `durationValue`, `targetValue` times.
 */
export interface PlannedStep {
  index: number
  name?: string
  notes?: string
  /** WARMUP, ACTIVE, INTERVAL, RECOVERY, REST, COOLDOWN… */
  intensity?: string
  /** TIME, DISTANCE, REPS, OPEN, HR_LESS_THAN, REPEAT_UNTIL_STEPS_CMPLT… */
  durationType?: string
  durationValue?: number
  /** HEART_RATE, SPEED, PACE, CADENCE, POWER, OPEN… */
  targetType?: string
  /** A zone number, or 0 for the custom range in targetLow–targetHigh. */
  targetValue?: number
  targetLow?: number
  targetHigh?: number
}

/** The workout the watch was following (a coach's plan sent to Garmin Connect, for example). */
export interface PlannedWorkout {
  name?: string
  steps: PlannedStep[]
}

/** A Garmin activity, imported from its .FIT file. */
export interface Activity extends Synced {
  /** FIT sport and sub-sport names ("running", "trail"). */
  sport: string
  subSport?: string
  /** The activity's name in Garmin Connect, when it came through the API. */
  title?: string
  garminId?: number
  workout?: PlannedWorkout
  date: DayKey
  startTime: number
  /** Includes pauses. */
  elapsedSec: number
  /** Excludes pauses. */
  timerSec: number
  distanceM?: number
  calories?: number
  avgHr?: number
  maxHr?: number
  avgSpeed?: number
  maxSpeed?: number
  ascentM?: number
  descentM?: number
  /** Steps per minute when on foot, rpm on a bike. */
  avgCadence?: number
  avgPower?: number
  maxPower?: number
  normalizedPower?: number
  aerobicEffect?: number
  anaerobicEffect?: number
  device?: string
  laps: ActivityLap[]
  /** Seconds in heart rate zones 1–5, and each zone's upper limit in bpm. */
  hrZones?: { seconds: number[]; limits: number[] }
  sets?: WatchSet[]
  hasTrack: boolean
  fileName?: string
}

/**
 * An activity's samples, one every `step` seconds from its start, with null during pauses.
 * Kept apart from the activity so lists don't load them.
 */
export interface ActivityStream extends Synced {
  /** Same id as the activity. */
  id: string
  step: number
  hr?: (number | null)[]
  speed?: (number | null)[]
  altitude?: (number | null)[]
  distance?: (number | null)[]
  cadence?: (number | null)[]
  power?: (number | null)[]
  /** Simplified GPS route as [lat, lon]. */
  track?: [number, number][]
}

export type SleepStage = 'awake' | 'light' | 'deep' | 'rem'

/** A stretch of one sleep stage, from Health Connect. */
export interface SleepStageSpan {
  start: number
  end: number
  stage: SleepStage
}

/** One day of the watch's health data; the night counts for the morning it ends. */
export interface DailyHealth extends Synced {
  /** The day key, so each day has a single row on every device. */
  id: DayKey
  sleep?: {
    /** Garmin's sleep score, 0–100. */
    score?: number
    start?: number
    end?: number
    totalSec: number
    deepSec?: number
    lightSec?: number
    remSec?: number
    awakeSec?: number
    napSec?: number
    avgHr?: number
    avgRespiration?: number
  }
  hrv?: {
    /** Average over the night, in ms. */
    lastNight?: number
    weeklyAvg?: number
    /** BALANCED, UNBALANCED, LOW, POOR… */
    status?: string
    balancedLow?: number
    balancedHigh?: number
  }
  restingHr?: number
  stress?: { avg?: number; max?: number }
  bodyBattery?: { low?: number; high?: number; charged?: number; drained?: number }
  steps?: number
  calories?: { total?: number; active?: number }
  /** The night's stages in order, read from Health Connect on the phone (the API only has totals). */
  sleepStages?: SleepStageSpan[]
}
