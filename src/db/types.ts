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

export type Pose = 'front' | 'side' | 'back'

/** A body photo for comparing over time; the image lives in the photo store, like the plate photos. */
export interface ProgressPhoto extends Synced {
  date: DayKey
  time: number
  pose: Pose
  photoId: string
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
  /** When in the day it's usually done ("07:30"), which orders the day's list. */
  time?: string
  /** A key of the habit palette. */
  color?: string
  /** A key of the habit icons. */
  icon?: string
  /**
   * Done some days of the week instead of every day: at least `times` a week for a good habit, at
   * most `times` for one to avoid. Unset means every day.
   */
  frequency?: { times: number; per: 'week' }
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
  /** 1 when the user said they won't do it that day (rain for "sun in the morning"): neither done nor missed. */
  skipped?: 0 | 1
  /** Why it was skipped, in the user's words. */
  note?: string
}

/**
 * A pain or discomfort told in the diary, in the user's words ("canela direita"), with how bad it was
 * (1–10). It goes on from day to day with the last score until the user removes it.
 */
export interface Pain extends Synced {
  name: string
  /** The first day it hurt. */
  start: DayKey
  /** The last day it hurt; unset while it still does. */
  end?: DayKey
  /** The score from each day it was given on; the days in between keep the one before. */
  scores: Record<DayKey, number>
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

export type HomeCardId =
  | 'insights'
  | 'week'
  | 'sleep'
  | 'planned'
  | 'workout'
  | 'food'
  | 'body'
  | 'water'
  | 'habits'
  | 'journal'
  | 'agenda'
  | 'focus'
  | 'quick'
  | 'race'
  | 'restingHr'
  | 'hrv'
  | 'readiness'
  | 'battery'
  | 'steps'
  | 'burn'
  | 'runVolume'
  | 'pace'
  | 'trainingLoad'
  | 'records'
  | 'streak'
  | 'goalStreaks'
  | 'weather'

/** What the Hoje screen shows: big cards in "Em foco" (a carousel) and small ones in "Visualização rápida". */
export interface HomeAreas {
  focus: HomeCardId[]
  quick: HomeCardId[]
  /** "Minha semana" above "Em foco"; on unless false. */
  week?: boolean
  /** "Em foco" puts first what matters at this time of day; on unless false. */
  smartOrder?: boolean
  /** "Agora", the next step of the day, at the very top; on unless false. */
  now?: boolean
  /** Elements an update put into the saved areas once: one taken out afterwards stays out. */
  seen?: HomeCardId[]
}

/** The arrangement of the Hoje screen before the two areas (kept for the hidden cards). */
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
  homeAreas?: HomeAreas
  /** The daily analysis by Claude, made once a day on the first opening. On unless set to false. */
  insightsAuto?: boolean
  /** Where the weight is headed, and how fast (kg a week, negative to lose). */
  weightGoal?: WeightGoal
  /** The user describing themselves (routine, history, goals) for the analyses by Claude. */
  profile?: string
  /** Android reminders that only come when something is missing. */
  smartReminders?: SmartReminders
  /** The gym's bar and plates, for the plate calculator. */
  gym?: GymSetup
  /** The four sections on the phone's bottom bar (routes), in order. */
  navBar?: string[]
  /** What the "+" offers to log, in order (ids of the quick log items). */
  quickLog?: string[]
  /** Walks scheduled every week on these days, as plans the app makes for each date. */
  walkRoutine?: WalkRoutine
  /** The last weekly check-in of the nutrition targets: accepted or set aside for that week. */
  goalCheckIn?: GoalCheckIn
  /** A notification on Android when the coach sends new workouts (SisRUN, through the Garmin calendar); on unless false. */
  sisrunAlerts?: boolean
  /** Where the forecast is for (Clima and the scheduled workouts); unset means near the latest outdoor activity. */
  weatherPlace?: WeatherPlace
  /** Height in centimeters, for the BMI, the healthy weights and the Navy body fat formula. */
  heightCm?: number
  /** The Navy body fat formula has one version for each. */
  sex?: Sex
}

/** A place picked for the weather forecast, its coordinates rounded to 2 decimals (about 1 km). */
export interface WeatherPlace {
  /** "Porto Alegre, RS", or "Minha localização". */
  name: string
  lat: number
  lon: number
}

export type Sex = 'male' | 'female'

/** A weekly check-in of the calorie and macro targets, from the expenditure estimate and the weight goal. */
export interface GoalCheckIn {
  /** The week it was for (its Sunday). */
  week: DayKey
  status: 'accepted' | 'dismissed'
  /** The targets before and the ones proposed. */
  before?: MacroGoals
  proposed?: MacroGoals
  /** The expenditure estimate (TDEE) it used, kcal a day. */
  expenditure?: number
}

/** A walk planned every week: on which weekdays, when, and how long or how far. */
export interface WalkRoutine {
  /** 0 = Sunday … 6 = Saturday. */
  days: number[]
  /** "07:00". */
  time?: string
  targetMin?: number
  targetKm?: number
  /** The first day it applies (the walks before it weren't planned); set again when the days change. */
  since?: DayKey
}

/** Each one is on when set: a time ("08:30") for the weigh-in and the meals, true for water. */
export interface SmartReminders {
  /** No weigh-in yet today by then. */
  weighIn?: string
  /** Nothing logged at lunch by then. */
  lunch?: string
  /** Nothing logged at dinner by then. */
  dinner?: string
  /** Behind the day's water pace at 11h, 15h and 19h. */
  water?: boolean
  /** Minutes before each planned workout that has a time (gym and runs) for a heads-up. */
  workouts?: number
  /** On Sunday at 20h, the week that ended in numbers. */
  weekly?: boolean
}

export interface GymSetup {
  barKg: number
  /** The plate weights the gym has (any number of each). */
  plates: number[]
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
  source: 'custom' | 'openfoodfacts' | 'recipe' | 'health-connect' | 'ai'
  /** The TACO food this one replaces in searches: the user's own version of it. */
  basedOn?: string
  /** For recipes: what went in, with each food's values as they were when added. */
  ingredients?: RecipeIngredient[]
  /** For recipes: the weight once ready, when it differs from the ingredients' sum (water lost or absorbed). */
  yieldGrams?: number
  /** The product's picture from Open Food Facts, for foods read by barcode. */
  imageUrl?: string
  /**
   * The values the user looked at and said are right ("Está certo" in "Revisar alimentos"), as their
   * fingerprint: the food stays out of that list until one of them changes.
   */
  checked?: string
}

export interface RecipeIngredient {
  foodId: string
  name: string
  grams: number
  per100: Nutrients
}

/** `snack` is the afternoon snack (it was the only one before the morning snack existed). */
export type MealKey = 'breakfast' | 'morningSnack' | 'lunch' | 'snack' | 'dinner' | 'supper'

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
  /** A 1-tap shortcut on the food screen (supplements, the daily coffee), with its amount. No longer offered. */
  quick?: QuickAmount
  /** The user's photo of the food (a photo store id), shown before its name in the lists. */
  photoId?: string
  /** The food's emoji, chosen by the user or suggested by the AI; shown when there's no photo. */
  emoji?: string
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
  /** The matching exercise of the free-exercise-db dataset (its id), for the pictures and the steps. */
  mediaId?: string
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
  /** The rest after a warm-up set; DEFAULT_WARMUP_REST_SEC when unset. */
  warmupRestSec?: number
  notes?: string
  sets: PlannedSet[]
  /** Done alternating with the next exercise (bi-set): the rest comes after the pair. */
  supersetWithNext?: boolean
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
  /** Reps in reserve: how many more the set had in it (0 = to failure), when told. */
  rir?: number
}

export interface SessionExercise {
  key: string
  exerciseId: string
  restSec: number
  /** The rest after a warm-up set; DEFAULT_WARMUP_REST_SEC when unset. */
  warmupRestSec?: number
  notes?: string
  sets: PerformedSet[]
  /** Done alternating with the next exercise (bi-set): the rest comes after the pair. */
  supersetWithNext?: boolean
}

/**
 * The time the user plans to do a workout of the Garmin calendar: the coach's workouts come with a
 * day but no time. Keyed by the event (its uid, or its name) and its day.
 */
export interface EventTime extends Synced {
  id: string
  date: DayKey
  /** "07:00"; unset when the workout is only hidden. */
  time?: string
  /** The user hid this workout (a duplicate of another one, say); it leaves the agenda. */
  hidden?: boolean
}

/**
 * A workout scheduled for a day: a gym template (ficha) or a walk, and at what time when one was
 * picked. The weekly walks' plans are made by the app (`walk-<date>`); a row with that id is the
 * user's change to that day, and a deleted one takes the day off.
 */
export interface WorkoutPlan extends Synced {
  date: DayKey
  /** The ficha of a gym workout; walks have none. */
  templateId?: string
  /** "18:30". */
  time?: string
  /** A gym workout (the default) or a walk, which has no template. */
  kind?: 'gym' | 'walk'
  /** For walks: how long and how far, when planned. */
  targetMin?: number
  targetKm?: number
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
  /** How hard the whole session felt, 1–10 (RPE). */
  effort?: number
  /** Where it hurt or felt off (keys of DISCOMFORT_AREAS). */
  discomfort?: string[]
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
  /** How hard it felt, 1–10 (RPE), told after the workout. */
  effort?: number
  /** Where it hurt or felt off (keys of DISCOMFORT_AREAS). */
  discomfort?: string[]
  /** The user's comment on the workout: what they tell their coach. */
  notes?: string
  /** The shoes (a gear id) worn, for their distance. */
  gearId?: string
  /** The weather where and when it happened (outdoor activities with a route). */
  weather?: ActivityWeather
}

/** The weather at an activity's middle point in time, from Open-Meteo. */
export interface ActivityWeather {
  tempC: number
  /** Apparent ("feels like") temperature. */
  feelsC?: number
  /** Relative humidity, %. */
  humidity?: number
  windKmh?: number
  /** mm in that hour. */
  precipitationMm?: number
  /** WMO weather code (0 clear … 95 thunderstorm). */
  code?: number
}

/**
 * A race: put in the app, or brought from the Garmin calendar. Its run is the one linked to it
 * ("É uma prova" on the run), else the longest run of its day.
 */
export interface Race extends Synced {
  name: string
  date: DayKey
  /** "08:00". */
  time?: string
  /** Meters. */
  distanceM?: number
  /** A race given as a range ("6 a 8 km"): its ends, in meters, in place of `distanceM`. */
  rangeM?: [number, number]
  /** The time aimed for, in seconds. */
  goalSec?: number
  /** The run that was the race. */
  activityId?: string
  /** The official (chip) time, in seconds, when it differs from the watch's. */
  officialSec?: number
  /** The Garmin calendar event it was brought from (its key), so the two show as one. */
  eventKey?: string
  /** The rest: placing, category, bib, how it went. */
  notes?: string
}

/** A pair of shoes (or other gear) whose distance adds up from the activities that used it. */
export interface Gear extends Synced {
  name: string
  kind: 'shoe'
  /** Kilometers it already had when added. */
  startKm?: number
  /** When to replace it, km (700 when unset). */
  limitKm?: number
  /** The default for new activities of these kinds ("run", "walk"). */
  defaultFor?: string[]
  retired?: 0 | 1
  /** When it started being used. */
  since?: DayKey
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
