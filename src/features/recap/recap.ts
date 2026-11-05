import type { Tone } from '../../components/tone'
import type {
  Activity,
  ActivityStream,
  DailyHealth,
  Exercise,
  FoodLog,
  Habit,
  HabitLog,
  JournalEntry,
  MeasurementEntry,
  MuscleGroup,
  Pain,
  Settings,
  WaterLog,
  WeightEntry,
  WorkoutSession,
} from '../../db/types'
import { dayRange, daysBetween, parseDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatClock, formatDuration, formatNumber, formatSigned } from '../../lib/format'
import { metricSeries } from '../body/body'
import { activityKind, isRace } from '../calendar/agenda'
import { goalsFor } from '../food/nutrition'
import { daysByHabit, isSuccess, NO_DAYS, type HabitDays } from '../habits/habits'
import { effortsByDistance, formatPace, isOutdoorRun, isRun, trainingDays } from '../running/running'
import { MUSCLES } from '../training/catalog'
import { bestE1rm, setsByMuscle, summarize, workingSets } from '../training/stats'

/** Everything a year in numbers reads; rows without the deleted ones. */
export interface RecapSources {
  /** Activities up to the year's end: earlier runs tell whether the year's best times were records. */
  activities: Activity[]
  /** The outdoor runs' distance samples, for the best times. */
  streams: Map<string, Pick<ActivityStream, 'step' | 'distance'>>
  sessions: WorkoutSession[]
  exercises: Map<string, Exercise>
  health: DailyHealth[]
  /** Weigh-ins up to the year's end, so the trend is settled when the year starts. */
  weights: WeightEntry[]
  measurements: MeasurementEntry[]
  habits: Habit[]
  habitLogs: HabitLog[]
  foodLogs: FoodLog[]
  water: WaterLog[]
  journal: JournalEntry[]
  pains: Pain[]
  settings: Pick<Settings, 'nutrition' | 'waterGoalMl' | 'measurementSites'>
  /** Races the Garmin calendar knew of (title and day), past ones included when still known. */
  raceEvents?: { title: string; date: DayKey }[]
}

export interface RunBest {
  label: string
  short: string
  seconds: number
  meters: number
  date: DayKey
  activityId: string
  /** Faster than any run before the year: a personal record set that year. */
  record: boolean
}

export interface RunningRecap {
  runs: number
  km: number
  seconds: number
  longest?: { km: number; date: DayKey; activityId: string }
  /** The fastest average pace of an outdoor run of at least 3 km. */
  fastest?: { secondsPerKm: number; km: number; date: DayKey; activityId: string }
  bests: RunBest[]
  races: { title: string; date: DayKey; km: number; seconds: number; activityId: string }[]
}

export interface StrengthRecap {
  sessions: number
  sets: number
  volumeKg: number
  seconds: number
  topMuscle?: { muscle: MuscleGroup; label: string; sets: number }
  /** The biggest rises of the estimated 1RM, from the first weeks of an exercise in the year to its last ones. */
  gains: { exerciseId: string; name: string; fromKg: number; toKg: number }[]
}

export interface HabitRecap {
  id: string
  name: string
  /** Share of days (or weeks, for a habit of some days a week) met; the skipped days left out. */
  rate: number
  /** The longest run met in a row, in days or weeks. */
  best: number
  unit: 'dias' | 'semanas'
}

export interface Recap {
  year: number
  from: DayKey
  /** The last day counted: December 31, or today for the current year. */
  to: DayKey
  partial: boolean
  /** Days with any workout: the watch's activities and the gym. */
  trainingDays: number
  /** The watch's time, plus gym workouts it didn't record. */
  trainingSeconds: number
  months: { month: number; days: number; length: number; future: boolean }[]
  running?: RunningRecap
  walking?: { walks: number; km: number; seconds: number }
  strength?: StrengthRecap
  steps?: { total: number; days: number; average: number; best: { date: DayKey; steps: number } }
  sleep?: { nights: number; averageSec: number; averageScore?: number; bestMonth?: { month: number; averageSec: number; averageScore?: number } }
  body?: {
    weighIns: number
    start: { date: DayKey; kg: number }
    end: { date: DayKey; kg: number }
    lowest: { date: DayKey; kg: number }
    fat?: { start: number; end: number }
    measurements: { key: string; label: string; startCm: number; endCm: number }[]
  }
  habits?: { rate: number; list: HabitRecap[] }
  /** Averages over the days logged; the goals are today's (no history of them is kept), by training day or not. */
  food?: { days: number; kcal: number; protein: number; goalKcal?: number; goalProtein?: number; onTarget?: number; withGoal: number }
  water?: { liters: number; days: number; goalDays: number }
  journal?: { days: number; moodDays: number; mood?: number }
  pains?: { episodes: number; names: string[] }
  highlights: Highlight[]
}

export interface Highlight {
  value: string
  label: string
  tone: Tone
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const monthName = (month: number): string => MONTHS[month]

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
const average = (values: number[]) => (values.length ? sum(values) / values.length : undefined)
const monthOf = (date: DayKey) => Number(date.slice(5, 7)) - 1

/** The days the year runs over: all of it, or up to today for the current one. */
export function yearBounds(year: number, today: DayKey): { from: DayKey; to: DayKey; partial: boolean } {
  const from = `${year}-01-01`
  const end = `${year}-12-31`
  return { from, to: today < end ? today : end, partial: today < end }
}

/** The year the page opens on: the current one, except in January, when the last one just ended. */
export function defaultYear(today: DayKey, years: number[]): number {
  const year = Number(today.slice(0, 4))
  return today.slice(5, 7) === '01' && years.includes(year - 1) ? year - 1 : year
}

/** The years since the first record, the current one included. */
export function recapYears(firstDay: DayKey | undefined, today: DayKey): number[] {
  const last = Number(today.slice(0, 4))
  const first = firstDay ? Math.min(Number(firstDay.slice(0, 4)), last) : last
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

/** The Hoje banner shows the year's recap from December 1 to January 15. */
export function recapBannerYear(today: DayKey): number | undefined {
  const year = Number(today.slice(0, 4))
  const month = today.slice(5, 7)
  if (month === '12') return year
  if (month === '01' && Number(today.slice(8, 10)) <= 15) return year - 1
  return undefined
}

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * A run named like a race ("Rústica de Morungava", "Meia Maratona", "São Silvestre 15K"), not like
 * the coach's workouts ("Corrida 7 Km", "Intervalado ativo 4,48 - 4,97 Km") or the watch's own names.
 */
export function looksLikeRace(title: string | undefined): boolean {
  if (!title || /^\s*\d{1,2}\/\d{1,2}/.test(title)) return false
  const name = plain(title)
  if (/intervalad|regenerativ|rodagem|fartlek|\btiros?\b|longao|\blongo\b|educativ|\bativo\b|progressiv|\bleve\b|recupera|treino|aquecimento|\britmo\b/.test(name)) {
    return false
  }
  return /rustica|maratona|\bmeia\b|\bprova\b|desafio|circuito|\b\d+ ?k\b|\brun\b/.test(name)
}

// ---------------------------------------------------------------- sections

function runningRecap(s: RecapSources, inYear: (date: DayKey) => boolean, from: DayKey, to: DayKey): RunningRecap | undefined {
  const runs = s.activities.filter((activity) => isRun(activity) && inYear(activity.date))
  if (runs.length === 0) return undefined
  const km = sum(runs.map((run) => run.distanceM ?? 0)) / 1000
  const longestRun = runs.reduce<Activity | undefined>((best, run) => ((run.distanceM ?? 0) > (best?.distanceM ?? 0) ? run : best), undefined)
  const paced = runs.filter((run) => isOutdoorRun(run) && (run.distanceM ?? 0) >= 3000 && run.timerSec > 0)
  const fastestRun = paced.reduce<Activity | undefined>(
    (best, run) => (!best || run.timerSec / run.distanceM! < best.timerSec / best.distanceM! ? run : best),
    undefined,
  )

  // Each distance's best of the year, a record when no earlier run was faster.
  const earlier = s.activities.filter((activity) => isRun(activity) && activity.date <= to)
  const bests: RunBest[] = effortsByDistance(earlier, s.streams, Infinity).flatMap(({ meters, label, short, efforts }) => {
    const best = efforts.find((effort) => inYear(effort.date))
    if (!best) return []
    const before = efforts.find((effort) => effort.date < from)
    return [{ label, short, meters, seconds: best.seconds, date: best.date, activityId: best.activityId, record: !before || best.seconds < before.seconds }]
  })

  // Races: a run named like one, or the longest run of a day the calendar had a race on.
  const raceDays = new Set((s.raceEvents ?? []).filter((event) => isRace(event) && inYear(event.date)).map((event) => event.date))
  const longestOfDay = new Map<DayKey, Activity>()
  for (const run of runs) {
    const current = longestOfDay.get(run.date)
    if (!current || (run.distanceM ?? 0) > (current.distanceM ?? 0)) longestOfDay.set(run.date, run)
  }
  const raceTitle = (date: DayKey) => s.raceEvents?.find((event) => event.date === date && isRace(event))?.title
  const races = runs
    .filter((run) => looksLikeRace(run.title) || (raceDays.has(run.date) && longestOfDay.get(run.date) === run))
    .sort((a, b) => a.startTime - b.startTime)
    .map((run) => ({
      title: (looksLikeRace(run.title) ? run.title : raceTitle(run.date)) ?? 'Prova',
      date: run.date,
      km: (run.distanceM ?? 0) / 1000,
      seconds: run.timerSec,
      activityId: run.id,
    }))

  return {
    runs: runs.length,
    km,
    seconds: sum(runs.map((run) => run.timerSec)),
    longest: longestRun?.distanceM ? { km: longestRun.distanceM / 1000, date: longestRun.date, activityId: longestRun.id } : undefined,
    fastest: fastestRun && {
      secondsPerKm: fastestRun.timerSec / (fastestRun.distanceM! / 1000),
      km: fastestRun.distanceM! / 1000,
      date: fastestRun.date,
      activityId: fastestRun.id,
    },
    bests,
    races,
  }
}

/** Gains need the exercise done over at least this long in the year. */
const GAIN_SPAN_DAYS = 28

function strengthRecap(sessions: WorkoutSession[], exercises: Map<string, Exercise>, from: DayKey, to: DayKey): StrengthRecap | undefined {
  if (sessions.length === 0) return undefined
  let sets = 0
  let volumeKg = 0
  let seconds = 0
  for (const session of sessions) {
    const summary = summarize(session)
    sets += summary.sets
    volumeKg += summary.volumeKg
    seconds += (summary.durationMs ?? 0) / 1000
  }
  const muscles = [...setsByMuscle(sessions, exercises, from, to)].sort((a, b) => b[1] - a[1])
  const top = muscles[0]

  // Each exercise's estimated 1RM per session, oldest first.
  const byExercise = new Map<string, { date: DayKey; kg: number }[]>()
  for (const session of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    for (const exercise of session.exercises) {
      const kg = bestE1rm(workingSets(exercise))
      if (kg === undefined) continue
      const list = byExercise.get(exercise.exerciseId) ?? []
      list.push({ date: session.date, kg })
      byExercise.set(exercise.exerciseId, list)
    }
  }
  // The best of its first 4 weeks against the best of its last 4: one good or bad day weighs less.
  const gains = [...byExercise].flatMap(([exerciseId, list]) => {
    const first = list[0].date
    const last = list.at(-1)!.date
    if (daysBetween(first, last) < GAIN_SPAN_DAYS) return []
    const fromKg = Math.max(...list.filter((entry) => daysBetween(first, entry.date) < GAIN_SPAN_DAYS).map((entry) => entry.kg))
    const toKg = Math.max(...list.filter((entry) => daysBetween(entry.date, last) < GAIN_SPAN_DAYS).map((entry) => entry.kg))
    if (toKg - fromKg < 0.5) return []
    return [{ exerciseId, name: exercises.get(exerciseId)?.name ?? 'Exercício', fromKg, toKg }]
  })
  gains.sort((a, b) => b.toKg - b.fromKg - (a.toKg - a.fromKg))

  return {
    sessions: sessions.length,
    sets,
    volumeKg,
    seconds,
    topMuscle: top && { muscle: top[0], label: MUSCLES[top[0]], sets: top[1] },
    gains: gains.slice(0, 3),
  }
}

function sleepRecap(nights: DailyHealth[]): Recap['sleep'] {
  const slept = nights.filter((day) => (day.sleep?.totalSec ?? 0) > 0)
  if (slept.length === 0) return undefined
  const scored = slept.filter((day) => day.sleep!.score !== undefined)
  // The best month: the highest score when the watch gives them, else the longest nights; a month needs a week of nights.
  const byMonth = new Map<number, DailyHealth[]>()
  for (const day of slept) byMonth.set(monthOf(day.id), [...(byMonth.get(monthOf(day.id)) ?? []), day])
  const useScore = scored.length >= 7
  let bestMonth: NonNullable<Recap['sleep']>['bestMonth']
  let bestValue = -Infinity
  for (const [month, days] of byMonth) {
    const scores = days.flatMap((day) => (day.sleep!.score !== undefined ? [day.sleep!.score] : []))
    if ((useScore ? scores.length : days.length) < 7) continue
    const averageSec = average(days.map((day) => day.sleep!.totalSec))!
    const averageScore = average(scores)
    const value = useScore ? averageScore! : averageSec
    if (value > bestValue) {
      bestValue = value
      bestMonth = { month, averageSec, averageScore }
    }
  }
  return {
    nights: slept.length,
    averageSec: average(slept.map((day) => day.sleep!.totalSec))!,
    averageScore: average(scored.map((day) => day.sleep!.score!)),
    bestMonth,
  }
}

function bodyRecap(s: RecapSources, inYear: (date: DayKey) => boolean): Recap['body'] {
  const { readings, trend } = metricSeries(s.weights, (entry) => entry.weightKg)
  const year = readings.filter((point) => inYear(point.date))
  if (year.length === 0) return undefined
  const yearTrend = trend.filter((point) => inYear(point.date))
  const lowest = year.reduce((low, point) => (point.value < low.value ? point : low))
  const fat = metricSeries(s.weights, (entry) => entry.bodyFatPct).trend.filter((point) => inYear(point.date))

  // Each site's first and last measurement of the year.
  const sorted = s.measurements.filter((entry) => inYear(entry.date)).sort((a, b) => a.date.localeCompare(b.date))
  const measurements = s.settings.measurementSites.flatMap((site) => {
    const taken = sorted.filter((entry) => entry.values[site.key] !== undefined)
    if (taken.length < 2 || taken[0].date === taken.at(-1)!.date) return []
    return [{ key: site.key, label: site.label, startCm: taken[0].values[site.key], endCm: taken.at(-1)!.values[site.key] }]
  })

  return {
    weighIns: year.length,
    start: { date: yearTrend[0].date, kg: yearTrend[0].value },
    end: { date: yearTrend.at(-1)!.date, kg: yearTrend.at(-1)!.value },
    lowest: { date: lowest.date, kg: lowest.value },
    fat: fat.length >= 2 ? { start: fat[0].value, end: fat.at(-1)!.value } : undefined,
    measurements,
  }
}

/** A habit over the year: its rate and longest run met, by day, or by week for one of some days a week. */
function habitRecap(habit: Habit, days: HabitDays, yearDays: DayKey[], firstWeekday: number, start: number, end: number): HabitRecap | undefined {
  let counted = 0
  let hits = 0
  let run = 0
  let best = 0
  const frequency = habit.frequency
  if (frequency) {
    // Whole weeks only (Sunday to Saturday), so a week cut by the start or by today doesn't count as missed.
    let i = start + ((7 - ((firstWeekday + start) % 7)) % 7)
    for (; i + 6 <= end; i += 7) {
      let count = 0
      for (let d = i; d < i + 7; d++) {
        const day = yearDays[d]
        if (days.skipped.has(day)) continue
        const value = days.values.get(day)
        if (habit.polarity === 'good' ? isSuccess(habit, value) : (value ?? 0) > 0) count++
      }
      const met = habit.polarity === 'good' ? count >= frequency.times : count <= frequency.times
      counted++
      if (met) hits++
      run = met ? run + 1 : 0
      best = Math.max(best, run)
    }
  } else {
    for (let i = start; i <= end; i++) {
      const day = yearDays[i]
      if (days.skipped.has(day)) continue
      counted++
      const met = isSuccess(habit, days.values.get(day))
      if (met) hits++
      run = met ? run + 1 : 0
      best = Math.max(best, run)
    }
  }
  if (counted === 0) return undefined
  return { id: habit.id, name: habit.name, rate: hits / counted, best, unit: frequency ? 'semanas' : 'dias' }
}

function habitsRecap(s: RecapSources, from: DayKey, habitsTo: DayKey): Recap['habits'] {
  if (habitsTo < from || s.habits.length === 0) return undefined
  const yearDays = dayRange(from, habitsTo)
  const index = new Map(yearDays.map((day, i) => [day, i]))
  const firstWeekday = parseDay(from).getDay()
  const logs = s.habitLogs.filter((log) => log.date >= from && log.date <= habitsTo)
  const values = daysByHabit(logs)
  const lastLog = new Map<string, DayKey>()
  for (const log of logs) if ((lastLog.get(log.habitId) ?? '') < log.date) lastLog.set(log.habitId, log.date)

  const list = s.habits.flatMap((habit) => {
    // An archived habit counts up to its last log of the year; one never logged in the year, not at all.
    const last = habit.archived ? lastLog.get(habit.id) : habitsTo
    if (!last || habit.startDate > last) return []
    const start = index.get(habit.startDate > from ? habit.startDate : from)!
    const recap = habitRecap(habit, values.get(habit.id) ?? NO_DAYS, yearDays, firstWeekday, start, index.get(last)!)
    return recap ? [recap] : []
  })
  if (list.length === 0) return undefined
  list.sort((a, b) => b.best - a.best || b.rate - a.rate)
  return { rate: average(list.map((habit) => habit.rate))!, list }
}

function foodRecap(s: RecapSources, inYear: (date: DayKey) => boolean, today: DayKey): Recap['food'] {
  const byDay = new Map<DayKey, { kcal: number; protein: number }>()
  for (const log of s.foodLogs) {
    if (!inYear(log.date)) continue
    const day = byDay.get(log.date) ?? { kcal: 0, protein: 0 }
    day.kcal += log.nutrients.kcal
    day.protein += log.nutrients.protein
    byDay.set(log.date, day)
  }
  // Today isn't over: it counts as logged, not in the averages.
  const counted = [...byDay].filter(([date]) => date !== today)
  if (counted.length === 0) return byDay.size > 0 ? { days: byDay.size, kcal: 0, protein: 0, withGoal: 0 } : undefined
  const trainingDates = new Set(s.sessions.map((session) => session.date))
  const goals = counted.flatMap(([date, day]) => {
    const goal = goalsFor(s.settings, trainingDates.has(date))
    return goal ? [{ goal, day }] : []
  })
  return {
    days: byDay.size,
    kcal: average(counted.map(([, day]) => day.kcal))!,
    protein: average(counted.map(([, day]) => day.protein))!,
    goalKcal: average(goals.map(({ goal }) => goal.kcal)),
    goalProtein: average(goals.map(({ goal }) => goal.protein)),
    onTarget: goals.length ? goals.filter(({ goal, day }) => Math.abs(day.kcal - goal.kcal) <= goal.kcal * 0.1).length : undefined,
    withGoal: goals.length,
  }
}

// ---------------------------------------------------------------- the year

/**
 * A year in numbers, like Strava's Year in Sport: training days month by month, running (km, time,
 * longest, fastest pace, best times and the records among them, races), walking, the gym (sessions,
 * sets, volume, the most trained muscle, the biggest 1RM gains), steps, sleep, body, habits, food,
 * water, the diary and the pains. A section is left out without data; the highlights pick the
 * year's big numbers. Linear in the rows, so two years of data stay quick.
 */
export function buildRecap(year: number, today: DayKey, s: RecapSources): Recap {
  const { from, to, partial } = yearBounds(year, today)
  const inYear = (date: DayKey) => date >= from && date <= to

  const activities = s.activities.filter((activity) => inYear(activity.date))
  const sessions = s.sessions.filter((session) => session.endedAt && inYear(session.date))
  const trained = trainingDays(activities, sessions)
  // Training time: the watch's timer, plus gym workouts the watch didn't record.
  const watchedGym = new Set(activities.filter((activity) => activityKind(activity) === 'gym').map((activity) => activity.date))
  const trainingSeconds =
    sum(activities.map((activity) => activity.timerSec)) +
    sum(sessions.filter((session) => !watchedGym.has(session.date)).map((session) => (summarize(session).durationMs ?? 0) / 1000))

  const months = Array.from({ length: 12 }, (_, month) => {
    const first = `${year}-${String(month + 1).padStart(2, '0')}-01`
    return { month, days: 0, length: new Date(year, month + 1, 0).getDate(), future: first > to }
  })
  for (const day of trained) months[monthOf(day)].days++

  const walks = activities.filter((activity) => activityKind(activity) === 'walk')
  const health = s.health.filter((day) => inYear(day.id))
  const stepDays = health.filter((day) => (day.steps ?? 0) > 0)
  const bestSteps = stepDays.reduce<DailyHealth | undefined>((best, day) => (day.steps! > (best?.steps ?? 0) ? day : best), undefined)

  const waterByDay = new Map<DayKey, number>()
  for (const log of s.water) if (inYear(log.date)) waterByDay.set(log.date, (waterByDay.get(log.date) ?? 0) + log.ml)

  const entries = s.journal.filter((entry) => inYear(entry.id))
  const moods = entries.flatMap((entry) => (entry.mood ? [entry.mood] : []))
  const written = entries.filter((entry) => entry.text.trim()).length

  const pains = s.pains
    .filter((pain) => pain.start <= to && (pain.end ?? today) >= from)
    .sort((a, b) => a.start.localeCompare(b.start))

  const recap: Recap = {
    year,
    from,
    to,
    partial,
    trainingDays: trained.size,
    trainingSeconds,
    months,
    running: runningRecap(s, inYear, from, to),
    walking: walks.length
      ? { walks: walks.length, km: sum(walks.map((walk) => walk.distanceM ?? 0)) / 1000, seconds: sum(walks.map((walk) => walk.timerSec)) }
      : undefined,
    strength: strengthRecap(sessions, s.exercises, from, to),
    steps: bestSteps && {
      total: sum(stepDays.map((day) => day.steps!)),
      days: stepDays.length,
      average: sum(stepDays.map((day) => day.steps!)) / stepDays.length,
      best: { date: bestSteps.id, steps: bestSteps.steps! },
    },
    sleep: sleepRecap(health),
    body: bodyRecap(s, inYear),
    // Today's habits aren't over yet.
    habits: habitsRecap(s, from, partial ? shiftDay(today, -1) : to),
    food: foodRecap(s, inYear, today),
    water: waterByDay.size
      ? {
          liters: sum([...waterByDay.values()]) / 1000,
          days: waterByDay.size,
          goalDays: s.settings.waterGoalMl > 0 ? [...waterByDay.values()].filter((ml) => ml >= s.settings.waterGoalMl).length : 0,
        }
      : undefined,
    journal: written || moods.length ? { days: written, moodDays: moods.length, mood: average(moods) } : undefined,
    pains: pains.length ? { episodes: pains.length, names: [...new Set(pains.map((pain) => pain.name.trim()))] } : undefined,
    highlights: [],
  }
  recap.highlights = highlightsOf(recap)
  return recap
}

// ---------------------------------------------------------------- words

const km = (value: number) => `${formatNumber(value, value >= 100 ? 0 : 1)} km`
const kg = (value: number) => `${formatNumber(value, 1)} kg`
const hours = (seconds: number) => formatDuration(seconds * 1000)
const plural = (count: number, one: string, many: string) => `${formatNumber(count, 0)} ${count === 1 ? one : many}`
const dayMonth = (date: DayKey) => `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`

/** 2_512_300 → "2,5 mi", 812_000 → "812 mil". */
export function compactCount(value: number): string {
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} mi`
  if (value >= 10_000) return `${formatNumber(value / 1000, 0)} mil`
  return formatNumber(value, 0)
}

/** Tonnes from kilos, "412 t" (or kilos below one tonne). */
export const tonnes = (kilos: number): string => (kilos >= 1000 ? `${formatNumber(kilos / 1000, kilos >= 100_000 ? 0 : 1)} t` : `${formatNumber(kilos, 0)} kg`)

/** The big numbers of the year, most telling first: at most six. */
function highlightsOf(r: Recap): Highlight[] {
  const list: Highlight[] = []
  if (r.trainingDays > 0) list.push({ value: formatNumber(r.trainingDays, 0), label: r.trainingDays === 1 ? 'dia de treino' : 'dias de treino', tone: 'training' })
  if (r.running) list.push({ value: km(r.running.km), label: `em ${plural(r.running.runs, 'corrida', 'corridas')}`, tone: 'today' })
  if (r.strength) list.push({ value: formatNumber(r.strength.sessions, 0), label: r.strength.sessions === 1 ? 'treino de musculação' : 'treinos de musculação', tone: 'training' })
  const records = r.running?.bests.filter((best) => best.record).length ?? 0
  if (records > 0) list.push({ value: formatNumber(records, 0), label: records === 1 ? 'recorde pessoal na corrida' : 'recordes pessoais na corrida', tone: 'analysis' })
  if (r.trainingSeconds >= 3600) list.push({ value: `${formatNumber(r.trainingSeconds / 3600, 0)} h`, label: 'de treino', tone: 'training' })
  if (r.steps) list.push({ value: compactCount(r.steps.total), label: 'passos', tone: 'today' })
  if (r.body && r.body.weighIns >= 2 && Math.abs(r.body.end.kg - r.body.start.kg) >= 0.1) {
    list.push({ value: `${formatSigned(r.body.end.kg - r.body.start.kg, 1)} kg`, label: 'no peso (tendência)', tone: 'body' })
  }
  const streak = r.habits?.list[0]
  if (streak && streak.best >= 3) {
    list.push({ value: formatNumber(streak.best, 0), label: `${streak.unit === 'dias' ? 'dias seguidos' : 'semanas seguidas'}: ${streak.name}`, tone: 'habits' })
  }
  if (r.water) list.push({ value: `${formatNumber(r.water.liters, 0)} L`, label: 'de água', tone: 'water' })
  return list.slice(0, 6)
}

/** The year as plain text, to paste anywhere ("Copiar resumo"). */
export function recapText(r: Recap): string {
  const lines = [`Minha retrospectiva de ${r.year}${r.partial ? ` (até ${dayMonth(r.to)})` : ''}`]
  const add = (title: string, parts: (string | false | undefined)[]) => {
    const text = parts.filter((part): part is string => Boolean(part)).join('; ')
    if (text) lines.push(`• ${title}: ${text}`)
  }
  if (r.trainingDays > 0) add('Treino', [plural(r.trainingDays, 'dia', 'dias'), r.trainingSeconds >= 3600 && `${hours(r.trainingSeconds)} no total`])
  const run = r.running
  if (run) {
    const records = run.bests.filter((best) => best.record)
    add('Corrida', [
      `${plural(run.runs, 'corrida', 'corridas')}, ${km(run.km)} em ${hours(run.seconds)}`,
      run.longest && `mais longa ${km(run.longest.km)}`,
      run.fastest && `ritmo mais rápido ${formatPace(run.fastest.secondsPerKm)}/km`,
      records.length > 0 && `recordes: ${records.map((best) => `${best.short} ${formatClock(best.seconds)}`).join(', ')}`,
      run.races.length > 0 && `provas: ${run.races.map((race) => `${race.title} (${dayMonth(race.date)})`).join(', ')}`,
    ])
  }
  if (r.walking) add('Caminhada', [`${plural(r.walking.walks, 'caminhada', 'caminhadas')}, ${km(r.walking.km)}`])
  const gym = r.strength
  if (gym) {
    add('Musculação', [
      `${plural(gym.sessions, 'treino', 'treinos')}, ${plural(gym.sets, 'série', 'séries')}, ${tonnes(gym.volumeKg)} levantadas`,
      gym.topMuscle && `mais treinado: ${gym.topMuscle.label.toLowerCase()}`,
      gym.gains.length > 0 && `maiores ganhos: ${gym.gains.map((gain) => `${gain.name} ${formatNumber(gain.fromKg, 0)}→${formatNumber(gain.toKg, 0)} kg`).join(', ')}`,
    ])
  }
  if (r.steps) add('Passos', [`${formatNumber(r.steps.total, 0)} no total`, `${formatNumber(r.steps.average, 0)} por dia`, `melhor dia ${formatNumber(r.steps.best.steps, 0)} (${dayMonth(r.steps.best.date)})`])
  if (r.sleep) {
    add('Sono', [
      `${hours(r.sleep.averageSec)} por noite`,
      r.sleep.averageScore !== undefined && `nota média ${formatNumber(r.sleep.averageScore, 0)}`,
      r.sleep.bestMonth && `melhor mês: ${monthName(r.sleep.bestMonth.month)}`,
    ])
  }
  const body = r.body
  if (body) {
    add('Corpo', [
      body.weighIns >= 2 ? `${kg(body.start.kg)} → ${kg(body.end.kg)}` : kg(body.end.kg),
      body.weighIns >= 2 && `menor peso ${kg(body.lowest.kg)}`,
      body.fat && `gordura ${formatSigned(body.fat.end - body.fat.start, 1)} p.p.`,
      body.measurements.length > 0 && body.measurements.map((m) => `${m.label.toLowerCase()} ${formatSigned(m.endCm - m.startCm, 1)} cm`).join(', '),
    ])
  }
  if (r.habits) {
    const best = r.habits.list[0]
    add('Hábitos', [`${formatNumber(r.habits.rate * 100, 0)}% cumpridos`, best && best.best > 0 && `melhor sequência: ${best.name}, ${best.best} ${best.unit}`])
  }
  const food = r.food
  if (food) {
    add('Alimentação', [
      plural(food.days, 'dia registrado', 'dias registrados'),
      food.kcal > 0 && `${formatNumber(food.kcal, 0)} kcal e ${formatNumber(food.protein, 0)} g de proteína por dia${food.goalKcal ? ` (metas atuais ${formatNumber(food.goalKcal, 0)} kcal e ${formatNumber(food.goalProtein!, 0)} g)` : ''}`,
    ])
  }
  if (r.water) add('Água', [`${formatNumber(r.water.liters, 0)} litros`, r.water.goalDays > 0 && `meta em ${plural(r.water.goalDays, 'dia', 'dias')}`])
  if (r.journal) add('Diário', [r.journal.days > 0 && plural(r.journal.days, 'dia escrito', 'dias escritos'), r.journal.mood !== undefined && `humor médio ${formatNumber(r.journal.mood, 1)} de 5`])
  if (r.pains) add('Dores', [plural(r.pains.episodes, 'episódio', 'episódios')])
  return lines.join('\n')
}
