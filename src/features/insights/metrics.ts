import type {
  Activity,
  ActivityStream,
  DailyHealth,
  FoodLog,
  Habit,
  HabitLog,
  JournalEntry,
  Pain,
  SleepStageSpan,
  WaterLog,
  WeightEntry,
  WorkoutSession,
} from '../../db/types'
import { dayKey, dayRange, shiftDay, type DayKey } from '../../lib/dates'
import { formatClock, formatDuration, formatNumber } from '../../lib/format'
import { checkWorkout, isWork } from '../activities/compliance'
import { isActiveOn } from '../journal/pains'
import { CTL_DAYS, dailyLoads, loadSeries, loadStatus } from '../running/load'
import { readiness } from '../running/readiness'
import { isRun } from '../running/running'

export type MetricGroup = 'Sono' | 'Recuperação' | 'Corpo' | 'Treino' | 'Corrida' | 'Dia' | 'Alimentação' | 'Hábitos' | 'Diário'

export interface Metric {
  key: string
  label: string
  group: MetricGroup
  /** "h" and "min" format as durations, "clock" as a time of day, "pace" as minutes per km. */
  unit: string
  digits: number
  /**
   * A night belongs to the morning it ends (as Garmin dates sleep), so what happens during a day
   * meets the night dated the next day.
   */
  timing: 'day' | 'night'
  /** A night measure read in the morning (the weight, the readiness): it comes "na manhã seguinte". */
  morning?: boolean
  /** Done / not done, compared as two groups of days. */
  binary?: boolean
  /** How it reads in "Depois de …" when binary. */
  phrase?: string
  /** What follows the number, for what reads better number first: "20% dos treinos com desconforto". */
  noun?: string
  /** A change, shown with its sign: "+0,2 kg". */
  signed?: boolean
  /** Can explain something (a habit, a workout) and/or be explained (sleep, HRV). */
  cause?: boolean
  effect?: boolean
  /** Measured on the day's runs, so it only exists on days with one. */
  during?: 'run'
  /** The weather of the day's runs: it explains those runs (pace, heart rate, effort) and nothing else. */
  condition?: boolean
  /** Computed from these (metric keys or whole groups): never explained by them, which would only find the formula. */
  madeOf?: { keys?: string[]; groups?: MetricGroup[] }
}

export type DayRow = Record<string, number>

export interface DailyData {
  metrics: Metric[]
  rows: Map<DayKey, DayRow>
}

export interface Sources {
  health: DailyHealth[]
  weights: WeightEntry[]
  foodLogs: FoodLog[]
  waterLogs: WaterLog[]
  habits: Habit[]
  habitLogs: HabitLog[]
  activities: Activity[]
  sessions: WorkoutSession[]
  journal: JournalEntry[]
  /** The pains told in the diary. */
  pains?: Pain[]
  /** The heart rate samples of the activities the watch gave no zones for, for their training load. */
  streams?: ReadonlyMap<string, Pick<ActivityStream, 'step' | 'hr'>>
}

const BASE_METRICS: Metric[] = [
  { key: 'sleepHours', label: 'Horas de sono', group: 'Sono', unit: 'h', digits: 2, timing: 'night', cause: true, effect: true },
  { key: 'sleepScore', label: 'Nota do sono', group: 'Sono', unit: '', digits: 0, timing: 'night', cause: true, effect: true },
  { key: 'deepHours', label: 'Sono profundo', group: 'Sono', unit: 'h', digits: 2, timing: 'night', effect: true },
  { key: 'remHours', label: 'Sono REM', group: 'Sono', unit: 'h', digits: 2, timing: 'night', effect: true },
  { key: 'awakeMin', label: 'Tempo acordado à noite', group: 'Sono', unit: 'min', digits: 0, timing: 'night', effect: true },
  // From the night's stages (Health Connect): the stretches awake between two of sleep.
  { key: 'awakenings', label: 'Despertares', group: 'Sono', unit: '', digits: 1, timing: 'night', noun: 'despertares', effect: true },
  { key: 'bedtime', label: 'Hora de dormir', group: 'Sono', unit: 'clock', digits: 2, timing: 'night', cause: true },
  { key: 'wakeTime', label: 'Hora de acordar', group: 'Sono', unit: 'clock', digits: 2, timing: 'night', morning: true, cause: true },
  // The morning's numbers also explain the day ahead: its workouts, the mood, the energy.
  { key: 'hrv', label: 'HRV da noite', group: 'Recuperação', unit: 'ms', digits: 0, timing: 'night', cause: true, effect: true },
  { key: 'restingHr', label: 'FC de repouso', group: 'Recuperação', unit: 'bpm', digits: 0, timing: 'night', cause: true, effect: true },
  { key: 'bodyBattery', label: 'Body Battery máximo', group: 'Recuperação', unit: '', digits: 0, timing: 'night', cause: true, effect: true },
  // The app's readiness that morning, made of the night, the training load and the pains.
  {
    key: 'readiness',
    label: 'Prontidão',
    group: 'Recuperação',
    unit: '',
    digits: 0,
    timing: 'night',
    morning: true,
    cause: true,
    effect: true,
    madeOf: { keys: ['sleepScore', 'hrv', 'restingHr', 'pain'], groups: ['Treino', 'Corrida'] },
  },
  { key: 'stress', label: 'Estresse médio', group: 'Dia', unit: '', digits: 0, timing: 'day', cause: true, effect: true },
  { key: 'steps', label: 'Passos', group: 'Dia', unit: '', digits: 0, timing: 'day', cause: true, effect: true },
  { key: 'activeCalories', label: 'Calorias ativas', group: 'Dia', unit: 'kcal', digits: 0, timing: 'day', cause: true },
  { key: 'activityMinutes', label: 'Minutos de atividade', group: 'Treino', unit: 'min', digits: 0, timing: 'day', cause: true },
  // Edwards TRIMP of every activity with a heart rate, as the Corrida screen counts it.
  { key: 'trainingLoad', label: 'Carga de treino', group: 'Treino', unit: '', digits: 0, timing: 'day', cause: true },
  { key: 'trainingEffect', label: 'Efeito de treino', group: 'Treino', unit: '', digits: 1, timing: 'day', cause: true },
  // Fitness minus fatigue going into the day (as the day before ended), once fitness had its 6 weeks to build.
  { key: 'form', label: 'Forma (TSB)', group: 'Treino', unit: '', digits: 0, timing: 'night', morning: true, signed: true, cause: true },
  {
    key: 'strengthDay',
    label: 'Dia de musculação',
    group: 'Treino',
    unit: '',
    digits: 0,
    timing: 'day',
    binary: true,
    phrase: 'dias de musculação',
    cause: true,
  },
  // Only on days with a rated session: how hard it felt, against the night after and the next days.
  { key: 'effort', label: 'Esforço da musculação', group: 'Treino', unit: '', digits: 1, timing: 'day', cause: true, effect: true },
  // Weight × reps of the work sets (the warm-ups left out), and how close to failure they went.
  { key: 'gymVolume', label: 'Volume da musculação', group: 'Treino', unit: 'kg', digits: 0, timing: 'day', cause: true, effect: true },
  { key: 'gymRir', label: 'RIR médio da musculação', group: 'Treino', unit: '', digits: 1, timing: 'day', cause: true },
  // On days with a workout told about (its effort or a discomfort): whether something hurt, 0 or 100%.
  {
    key: 'discomfort',
    label: 'Desconforto no treino',
    group: 'Treino',
    unit: '%',
    digits: 0,
    timing: 'day',
    binary: true,
    phrase: 'dias com desconforto no treino',
    noun: 'dos treinos com desconforto',
    effect: true,
  },
  { key: 'runKm', label: 'Distância corrida', group: 'Corrida', unit: 'km', digits: 1, timing: 'day', cause: true },
  // The day's runs together: pace and heart rate weighted by time, the effort told (PSE), the share
  // of the planned steps with a target that hit it, and the weather they were run in.
  { key: 'runPace', label: 'Ritmo da corrida', group: 'Corrida', unit: 'pace', digits: 0, timing: 'day', during: 'run', effect: true },
  { key: 'runHr', label: 'FC média da corrida', group: 'Corrida', unit: 'bpm', digits: 0, timing: 'day', during: 'run', effect: true },
  { key: 'runEffort', label: 'Esforço da corrida', group: 'Corrida', unit: '', digits: 1, timing: 'day', during: 'run', cause: true, effect: true },
  { key: 'onTarget', label: 'Etapas no alvo', group: 'Corrida', unit: '%', digits: 0, timing: 'day', during: 'run', effect: true },
  { key: 'runTemp', label: 'Temperatura na corrida', group: 'Corrida', unit: '°C', digits: 0, timing: 'day', during: 'run', condition: true, cause: true },
  { key: 'runHumidity', label: 'Umidade na corrida', group: 'Corrida', unit: '%', digits: 0, timing: 'day', during: 'run', condition: true, cause: true },
  { key: 'kcal', label: 'Calorias consumidas', group: 'Alimentação', unit: 'kcal', digits: 0, timing: 'day', cause: true, effect: true },
  // Of the days logged in full (1000 kcal or more), the latest food with calories: late dinners × sleep.
  { key: 'lastMeal', label: 'Hora da última refeição', group: 'Alimentação', unit: 'clock', digits: 2, timing: 'day', cause: true },
  // Eaten minus what the watch counted for the whole day (resting and active), on days logged in full.
  { key: 'balance', label: 'Saldo calórico', group: 'Alimentação', unit: 'kcal', digits: 0, timing: 'day', signed: true, cause: true },
  { key: 'protein', label: 'Proteína', group: 'Alimentação', unit: 'g', digits: 0, timing: 'day', cause: true },
  { key: 'carbs', label: 'Carboidratos', group: 'Alimentação', unit: 'g', digits: 0, timing: 'day', cause: true },
  { key: 'fat', label: 'Gorduras', group: 'Alimentação', unit: 'g', digits: 0, timing: 'day', cause: true },
  { key: 'water', label: 'Água', group: 'Alimentação', unit: 'L', digits: 1, timing: 'day', cause: true },
  { key: 'mood', label: 'Humor', group: 'Diário', unit: '', digits: 1, timing: 'day', cause: true, effect: true },
  { key: 'energy', label: 'Energia', group: 'Diário', unit: '', digits: 1, timing: 'day', cause: true, effect: true },
  // A pain going on that day, from the first one told in the diary.
  { key: 'pain', label: 'Dia com dor', group: 'Diário', unit: '', digits: 0, timing: 'day', binary: true, phrase: 'dias com dor', cause: true },
  { key: 'weight', label: 'Peso', group: 'Corpo', unit: 'kg', digits: 1, timing: 'night', morning: true },
  { key: 'bodyFat', label: 'Gordura corporal', group: 'Corpo', unit: '%', digits: 1, timing: 'night', morning: true },
  // The change shows the morning after: what was eaten one day meets the next weigh-in.
  { key: 'weightChange', label: 'Variação do peso', group: 'Corpo', unit: 'kg', digits: 2, timing: 'night', morning: true, signed: true, effect: true },
]

/** 23.5 -> "23:30", 24.5 -> "00:30" (bedtimes past midnight count as 24+). */
function clock(hours: number): string {
  const minutes = Math.round((hours % 24) * 60) % (24 * 60)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function formatMetric(metric: Metric, value: number): string {
  switch (metric.unit) {
    case 'clock':
      return clock(value)
    case 'h':
      return formatDuration(value * 3_600_000)
    case 'min':
      return `${Math.round(value)} min`
    case 'pace':
      return `${formatClock(value)} /km`
  }
  // Rounded first, so a tiny loss doesn't read "-0" and a gain gets its "+".
  const rounded = Number(value.toFixed(metric.digits)) || 0
  // "%" sticks to the number, as everywhere in the app.
  const unit = metric.unit === '%' ? '%' : metric.unit ? ` ${metric.unit}` : ''
  const text = formatNumber(rounded, metric.digits) + unit
  return metric.signed && rounded > 0 ? `+${text}` : text
}

/**
 * Axis ticks that read well: hours and clock times on quarter hours, half hours or whole hours (not on
 * ECharts' 18 minutes), paces on 5, 10, 15, 30 or 60 seconds.
 */
export function metricAxis(metric: Metric, values: number[]): { min?: number; max?: number; interval?: number } {
  const steps = metric.unit === 'h' || metric.unit === 'clock' ? [0.25, 0.5, 1, 2, 3, 6] : metric.unit === 'pace' ? [5, 10, 15, 30, 60, 120] : undefined
  if (!steps || values.length === 0) return {}
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const step = steps.find((size) => (hi - lo) / size <= 5) ?? steps[steps.length - 1]
  const min = Math.floor(lo / step) * step
  return { min, max: Math.max(Math.ceil(hi / step) * step, min + step), interval: step }
}

/** A time of day in hours: 06:45 → 6.75. */
function clockHours(time: number): number {
  const date = new Date(time)
  return date.getHours() + date.getMinutes() / 60
}

/** A meal's time of day in hours; one in the small hours (a late supper) counts as 24+. */
function mealClock(time: number): number {
  const hours = clockHours(time)
  return hours < 4 ? hours + 24 : hours
}

/** Bedtime in hours, counting past midnight as 24+ so 23:30 → 23.5 and 00:30 → 24.5. */
function bedtimeHours(start: number): number {
  const hours = clockHours(start)
  return hours < 12 ? hours + 24 : hours
}

/** A blip shorter than this isn't counted as waking up. */
const MIN_AWAKENING_MS = 60_000

/** The stretches awake between the first and the last of sleep (falling asleep and getting up are not awakenings). */
export function awakenings(spans: readonly SleepStageSpan[]): number | undefined {
  const asleep = spans.flatMap((span, i) => (span.stage === 'awake' ? [] : [i]))
  if (asleep.length === 0) return undefined
  return spans
    .slice(asleep[0], asleep[asleep.length - 1])
    .filter((span) => span.stage === 'awake' && span.end - span.start >= MIN_AWAKENING_MS).length
}

/** The share of a run's planned steps with a pace or heart rate target that hit it, counted as its check does. */
export function stepsOnTarget(activity: Pick<Activity, 'workout' | 'laps' | 'hrZones' | 'sport'>): { hit: number; steps: number } | undefined {
  const check = checkWorkout(activity)
  if (!check || check.status === 'mismatch') return undefined
  const judged = check.steps.filter((step) => step.lap && step.target)
  // The effort steps, when they have targets; else whatever had one (a warm-up at an easy pace).
  const work = judged.filter((step) => isWork(step.step))
  const counted = work.length > 0 ? work : judged
  if (counted.length === 0) return undefined
  return { hit: counted.filter((step) => step.target === 'ok').length, steps: counted.length }
}

function add(rows: Map<DayKey, DayRow>, day: DayKey, key: string, value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return
  const row = rows.get(day)
  if (row) row[key] = value
  else rows.set(day, { [key]: value })
}

function sumBy<T>(items: T[], day: (item: T) => DayKey, value: (item: T) => number): Map<DayKey, number> {
  const sums = new Map<DayKey, number>()
  for (const item of items) sums.set(day(item), (sums.get(day(item)) ?? 0) + value(item))
  return sums
}

function groupBy<T>(items: T[], day: (item: T) => DayKey): Map<DayKey, T[]> {
  const groups = new Map<DayKey, T[]>()
  for (const item of items) {
    const list = groups.get(day(item))
    if (list) list.push(item)
    else groups.set(day(item), [item])
  }
  return groups
}

/** The mean of `value` over the items that have one, each weighted by `weight`; undefined without any. */
function weighted<T>(items: T[], value: (item: T) => number | undefined, weight: (item: T) => number): number | undefined {
  let total = 0
  let weights = 0
  for (const item of items) {
    const v = value(item)
    const w = weight(item)
    if (v === undefined || !(w > 0)) continue
    total += v * w
    weights += w
  }
  return weights > 0 ? total / weights : undefined
}

/**
 * One row per day with every measure the app has, from `from` to `to`. Activity counts are 0 on
 * days without any (but only once activities exist), food and water only on days with entries.
 */
export function buildDailyData(sources: Sources, from: DayKey, to: DayKey): DailyData {
  const rows = new Map<DayKey, DayRow>()
  const days = dayRange(from, to)
  const today = dayKey()
  const inRange = (day: DayKey) => day >= from && day <= to

  for (const day of sources.health) {
    if (!inRange(day.id)) continue
    const sleep = day.sleep
    add(rows, day.id, 'sleepHours', sleep && sleep.totalSec / 3600)
    add(rows, day.id, 'sleepScore', sleep?.score)
    add(rows, day.id, 'deepHours', sleep?.deepSec !== undefined ? sleep.deepSec / 3600 : undefined)
    add(rows, day.id, 'remHours', sleep?.remSec !== undefined ? sleep.remSec / 3600 : undefined)
    add(rows, day.id, 'awakeMin', sleep?.awakeSec !== undefined ? sleep.awakeSec / 60 : undefined)
    add(rows, day.id, 'awakenings', day.sleepStages && day.sleepStages.length > 1 ? awakenings(day.sleepStages) : undefined)
    add(rows, day.id, 'bedtime', sleep?.start !== undefined ? bedtimeHours(sleep.start) : undefined)
    add(rows, day.id, 'wakeTime', sleep?.end !== undefined ? clockHours(sleep.end) : undefined)
    add(rows, day.id, 'hrv', day.hrv?.lastNight)
    add(rows, day.id, 'restingHr', day.restingHr)
    add(rows, day.id, 'bodyBattery', day.bodyBattery?.high)
    add(rows, day.id, 'stress', day.stress?.avg)
    add(rows, day.id, 'steps', day.steps)
    add(rows, day.id, 'activeCalories', day.calories?.active)
  }

  // First weigh-in of each day, and the change since the day before.
  const weighIns = new Map<DayKey, WeightEntry>()
  for (const entry of [...sources.weights].sort((a, b) => a.time - b.time)) {
    if (!weighIns.has(entry.date)) weighIns.set(entry.date, entry)
  }
  for (const day of days) {
    const entry = weighIns.get(day)
    if (!entry) continue
    add(rows, day, 'weight', entry.weightKg)
    add(rows, day, 'bodyFat', entry.bodyFatPct)
    const before = weighIns.get(shiftDay(day, -1))
    if (before) add(rows, day, 'weightChange', entry.weightKg - before.weightKg)
  }

  // Training: zero on days without one, from the first day the app knows about any.
  const finished = sources.sessions.filter((session) => session.endedAt)
  for (const session of finished) if (session.effort !== undefined) add(rows, session.date, 'effort', session.effort)
  const knownSince = [...sources.activities.map((a) => a.date), ...finished.map((s) => s.date)].sort()[0]
  if (knownSince) {
    const minutes = sumBy(sources.activities, (a) => a.date, (a) => a.timerSec / 60)
    const run = sumBy(
      sources.activities.filter((a) => a.sport === 'running'),
      (a) => a.date,
      (a) => (a.distanceM ?? 0) / 1000,
    )
    const effect = sumBy(sources.activities, (a) => a.date, (a) => a.aerobicEffect ?? 0)
    const strength = new Set([
      ...sources.activities.filter((a) => a.subSport === 'strengthTraining').map((a) => a.date),
      ...finished.map((s) => s.date),
    ])
    for (const day of days) {
      if (day < knownSince) continue
      add(rows, day, 'activityMinutes', minutes.get(day) ?? 0)
      add(rows, day, 'runKm', run.get(day) ?? 0)
      add(rows, day, 'trainingEffect', effect.get(day) ?? 0)
      add(rows, day, 'strengthDay', strength.has(day) ? 1 : 0)
    }
  }
  addLoadAndReadiness(rows, sources, days)
  addRuns(rows, sources.activities.filter((activity) => isRun(activity) && inRange(activity.date)))
  addGym(rows, finished.filter((session) => inRange(session.date)))

  // Discomfort, on the days a workout was told about: its effort, or where it hurt.
  const told = new Map<DayKey, boolean>()
  for (const workout of [...sources.activities, ...finished]) {
    const hurt = (workout.discomfort?.length ?? 0) > 0
    if (workout.effort === undefined && !hurt) continue
    told.set(workout.date, (told.get(workout.date) ?? false) || hurt)
  }
  for (const [day, hurt] of told) if (inRange(day)) add(rows, day, 'discomfort', hurt ? 100 : 0)

  // Food and water only where something was logged: an empty day is a missing log, not a fast.
  const totals = new Map<DayKey, { kcal: number; protein: number; carbs: number; fat: number }>()
  for (const log of sources.foodLogs) {
    const total = totals.get(log.date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    total.kcal += log.nutrients.kcal
    total.protein += log.nutrients.protein
    total.carbs += log.nutrients.carbs
    total.fat += log.nutrients.fat
    totals.set(log.date, total)
  }
  const lastMeal = new Map<DayKey, number>()
  for (const log of sources.foodLogs) {
    if (log.nutrients.kcal < 30) continue
    const hours = mealClock(log.time)
    if (hours > (lastMeal.get(log.date) ?? -1)) lastMeal.set(log.date, hours)
  }
  const burned = new Map(sources.health.map((day) => [day.id, day.calories?.total]))
  for (const [day, total] of totals) {
    if (!inRange(day)) continue
    if (total.kcal >= 1000) {
      add(rows, day, 'lastMeal', lastMeal.get(day))
      // Today's count from the watch is still going up.
      const spent = burned.get(day)
      if (spent !== undefined && day < today) add(rows, day, 'balance', total.kcal - spent)
    }
    add(rows, day, 'kcal', total.kcal)
    add(rows, day, 'protein', total.protein)
    add(rows, day, 'carbs', total.carbs)
    add(rows, day, 'fat', total.fat)
  }
  for (const [day, ml] of sumBy(sources.waterLogs, (log) => log.date, (log) => log.ml)) {
    if (inRange(day)) add(rows, day, 'water', ml / 1000)
  }

  // The diary's scales, on the days they were filled in.
  for (const entry of sources.journal) {
    if (!inRange(entry.id)) continue
    add(rows, entry.id, 'mood', entry.mood)
    add(rows, entry.id, 'energy', entry.energy)
  }

  // Pains: a day with one going on, or without, from the first pain ever told (before it, nothing was
  // being told) up to today.
  const pains = sources.pains ?? []
  const firstPain = pains.map((pain) => pain.start).sort()[0]
  if (firstPain) {
    for (const day of days) {
      if (day >= firstPain && day <= today) add(rows, day, 'pain', pains.some((pain) => isActiveOn(pain, day)) ? 1 : 0)
    }
  }

  // Habits: a missing log on a day the habit existed means not done (0); a skipped day is missing,
  // since it says nothing about what the habit does. Weekly habits too: the correlations compare
  // days, so each day stays as logged.
  const habitMetrics: Metric[] = []
  const values = new Map<string, number>()
  for (const log of sources.habitLogs) values.set(`${log.habitId}:${log.date}`, log.value)
  const skipped = new Set(sources.habitLogs.filter((log) => log.skipped).map((log) => `${log.habitId}:${log.date}`))
  for (const habit of sources.habits) {
    const key = `habit:${habit.id}`
    const binary = habit.kind === 'check'
    habitMetrics.push({
      key,
      label: habit.name,
      group: 'Hábitos',
      unit: binary ? '' : (habit.unit ?? ''),
      digits: 1,
      timing: 'day',
      binary,
      phrase: `dias com «${habit.name}»`,
      cause: true,
    })
    for (const day of days) {
      if (day < habit.startDate || day > today || skipped.has(`${habit.id}:${day}`)) continue
      const value = values.get(`${habit.id}:${day}`) ?? 0
      add(rows, day, key, binary ? (value > 0 ? 1 : 0) : value)
    }
  }

  return { metrics: [...BASE_METRICS, ...habitMetrics], rows }
}

/** The days before a night that the readiness compares it with. */
const READINESS_DAYS = 30

/**
 * The training load of each day (zero on days without, from the first with one), and for each morning
 * the form and the readiness as the day before ended: the morning comes before that day's workouts.
 */
function addLoadAndReadiness(rows: Map<DayKey, DayRow>, sources: Sources, days: DayKey[]) {
  const to = days[days.length - 1]
  if (!to) return
  const series = loadSeries(dailyLoads(sources.activities, sources.streams), to)
  const first = series[0]?.date
  const at = new Map(series.map((day, i) => [day.date, i]))
  // Fitness starts at zero: its first 6 weeks are mostly the average warming up, not form.
  const formFrom = first && shiftDay(first, CTL_DAYS)
  // Each morning's readiness reads its night and the 30 before: a window sliding along the sorted days.
  const health = [...sources.health].sort((a, b) => a.id.localeCompare(b.id))
  let start = 0
  let end = 0
  for (const day of days) {
    const index = at.get(day)
    if (index !== undefined) add(rows, day, 'trainingLoad', series[index].load)
    const before = shiftDay(day, -1)
    const evening = at.get(before)
    if (evening !== undefined && formFrom && before >= formFrom) add(rows, day, 'form', series[evening].tsb)
    const since = shiftDay(day, -READINESS_DAYS)
    while (start < health.length && health[start].id < since) start++
    while (end < health.length && health[end].id <= day) end++
    if (end === 0 || health[end - 1].id !== day) continue
    const ready = readiness({
      date: day,
      health: health.slice(start, end),
      load: evening === undefined ? undefined : loadStatus(series, before),
      pains: sources.pains,
    })
    add(rows, day, 'readiness', ready?.score)
  }
}

/** The measures of the day's runs, on the days with one. */
function addRuns(rows: Map<DayKey, DayRow>, runs: Activity[]) {
  const time = (run: Activity) => run.timerSec
  for (const [day, list] of groupBy(runs, (run) => run.date)) {
    const moving = list.filter((run) => (run.distanceM ?? 0) > 0 && run.timerSec > 0)
    const km = moving.reduce((total, run) => total + (run.distanceM ?? 0) / 1000, 0)
    if (km > 0) add(rows, day, 'runPace', moving.reduce((total, run) => total + run.timerSec, 0) / km)
    add(rows, day, 'runHr', weighted(list, (run) => run.avgHr, time))
    const efforts = list.flatMap((run) => (run.effort === undefined ? [] : [run.effort]))
    if (efforts.length > 0) add(rows, day, 'runEffort', efforts.reduce((total, effort) => total + effort, 0) / efforts.length)
    add(rows, day, 'runTemp', weighted(list, (run) => run.weather?.tempC, time))
    add(rows, day, 'runHumidity', weighted(list, (run) => run.weather?.humidity, time))
    let hit = 0
    let steps = 0
    for (const run of list) {
      const check = stepsOnTarget(run)
      if (!check) continue
      hit += check.hit
      steps += check.steps
    }
    if (steps > 0) add(rows, day, 'onTarget', (hit / steps) * 100)
  }
}

/** The gym's volume (weight × reps of the work sets) and their mean RIR, on the days with a session. */
function addGym(rows: Map<DayKey, DayRow>, sessions: WorkoutSession[]) {
  for (const [day, list] of groupBy(sessions, (session) => session.date)) {
    let volume = 0
    const rirs: number[] = []
    for (const exercise of list.flatMap((session) => session.exercises)) {
      for (const set of exercise.sets) {
        if (!set.done || set.kind === 'warmup') continue
        volume += (set.weightKg ?? 0) * (set.reps ?? 0)
        if (set.rir !== undefined) rirs.push(set.rir)
      }
    }
    if (volume > 0) add(rows, day, 'gymVolume', volume)
    if (rirs.length > 0) add(rows, day, 'gymRir', rirs.reduce((total, rir) => total + rir, 0) / rirs.length)
  }
}

/** Metrics with at least `min` days of values in the rows. */
export function availableMetrics(data: DailyData, min = 1): Metric[] {
  return data.metrics.filter((metric) => {
    let count = 0
    for (const row of data.rows.values()) if (row[metric.key] !== undefined && ++count >= min) return true
    return false
  })
}
