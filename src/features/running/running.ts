import type { Activity, ActivityStream, WorkoutSession } from '../../db/types'
import { daysBetween, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { activityKind } from '../calendar/agenda'

/** Runs only: walks and hikes are workouts of their own, never counted in the running (km, records, pace). */
export const isRun = (activity: Pick<Activity, 'sport' | 'subSport'>): boolean => activityKind(activity) === 'run'

/** Runs whose GPS distance can be trusted for records (not on a treadmill or indoors). */
export const isOutdoorRun = (activity: Pick<Activity, 'sport' | 'subSport'>): boolean =>
  isRun(activity) && activity.subSport !== 'treadmill' && activity.subSport !== 'indoorRunning'

export interface WeekVolume {
  /** The Sunday the week starts on. */
  week: DayKey
  km: number
  runs: number
  /** Running time (the watch's timer). */
  seconds: number
}

/** Running per week, Sunday to Saturday, for the last `weeks` weeks up to the current one, oldest first. */
export function weeklyVolume(activities: Activity[], today: DayKey, weeks: number): WeekVolume[] {
  const current = weekStart(today)
  const first = shiftDay(current, -7 * (weeks - 1))
  const last = shiftDay(current, 6)
  const list = Array.from({ length: weeks }, (_, i) => ({ week: shiftDay(first, 7 * i), km: 0, runs: 0, seconds: 0 }))
  for (const activity of activities) {
    if (activity.deleted || !isRun(activity) || activity.date < first || activity.date > last) continue
    const week = list[Math.floor(daysBetween(first, activity.date) / 7)]
    week.km += (activity.distanceM ?? 0) / 1000
    week.runs += 1
    week.seconds += activity.timerSec
  }
  return list.map((week) => ({ ...week, km: Math.round(week.km * 10) / 10 }))
}

/** Seconds per km of a week's running, when it had enough of it (3 km) to mean something. */
export const weekPace = (week: WeekVolume): number | undefined => (week.km >= 3 ? week.seconds / week.km : undefined)

/** The pace over several weeks together, weighted by distance. */
export function pooledPace(weeks: WeekVolume[]): number | undefined {
  const km = weeks.reduce((total, week) => total + week.km, 0)
  const seconds = weeks.reduce((total, week) => total + week.seconds, 0)
  return km >= 3 ? seconds / km : undefined
}

/** Days with any workout: the watch's activities and the gym workouts of the app. */
export function trainingDays(activities: Activity[], sessions: WorkoutSession[]): Set<DayKey> {
  const days = new Set<DayKey>()
  for (const activity of activities) if (!activity.deleted) days.add(activity.date)
  for (const session of sessions) if (!session.deleted && session.endedAt) days.add(session.date)
  return days
}

export interface Consistency {
  /** Weeks in a row with a workout, back from the current one (which counts once it has one). */
  weeksInRow: number
  /** The longest run of days in a row with a workout, ever. */
  bestDayStreak: number
  /** Days with a workout in the last `weeks` weeks. */
  daysTrained: number
}

export function consistency(days: Set<DayKey>, today: DayKey, weeks = 16): Consistency {
  const trainedIn = (sunday: DayKey) => Array.from({ length: 7 }, (_, i) => shiftDay(sunday, i)).some((day) => days.has(day))
  let week = weekStart(today)
  if (!trainedIn(week)) week = shiftDay(week, -7)
  let weeksInRow = 0
  while (weeksInRow < 520 && trainedIn(week)) {
    weeksInRow += 1
    week = shiftDay(week, -7)
  }

  let bestDayStreak = 0
  let streak = 0
  let previous: DayKey | undefined
  for (const day of [...days].sort()) {
    streak = previous !== undefined && shiftDay(previous, 1) === day ? streak + 1 : 1
    bestDayStreak = Math.max(bestDayStreak, streak)
    previous = day
  }

  const from = shiftDay(weekStart(today), -7 * (weeks - 1))
  const daysTrained = [...days].filter((day) => day >= from && day <= today).length
  return { weeksInRow, bestDayStreak, daysTrained }
}

export interface HeatDay {
  date: DayKey
  /** Kilometers run that day. */
  km: number
  /** Any workout that day (a run, the gym, another activity). */
  trained: boolean
  future: boolean
}

/** The last `weeks` weeks as columns of seven days (Sunday first), for a consistency map. */
export function heatmap(activities: Activity[], days: Set<DayKey>, today: DayKey, weeks = 16): HeatDay[][] {
  const first = shiftDay(weekStart(today), -7 * (weeks - 1))
  const km = new Map<DayKey, number>()
  for (const activity of activities) {
    if (activity.deleted || !isRun(activity) || activity.date < first) continue
    km.set(activity.date, (km.get(activity.date) ?? 0) + (activity.distanceM ?? 0) / 1000)
  }
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = shiftDay(first, w * 7 + d)
      return { date, km: km.get(date) ?? 0, trained: days.has(date), future: date > today }
    }),
  )
}

/**
 * The fastest time, in seconds, to cover `meters` anywhere in an activity: its samples come every
 * `step` seconds with the distance so far, and the start is interpolated between two samples.
 */
export function bestEffort(stream: Pick<ActivityStream, 'step' | 'distance'>, meters: number): number | undefined {
  const points: [number, number][] = []
  stream.distance?.forEach((distance, i) => {
    if (distance !== null && distance !== undefined) points.push([i * stream.step, distance])
  })
  let best: number | undefined
  let i = 0
  for (let j = 1; j < points.length; j++) {
    const [endTime, endDistance] = points[j]
    if (endDistance - points[0][1] < meters) continue
    while (i + 1 < j && endDistance - points[i + 1][1] >= meters) i++
    const [time0, distance0] = points[i]
    const [time1, distance1] = points[i + 1]
    const startDistance = endDistance - meters
    const start = distance1 > distance0 ? time0 + ((startDistance - distance0) / (distance1 - distance0)) * (time1 - time0) : time0
    const seconds = endTime - start
    if (best === undefined || seconds < best) best = seconds
  }
  return best
}

export const RECORD_DISTANCES = [
  { meters: 1000, label: '1 km', short: '1 km' },
  { meters: 5000, label: '5 km', short: '5 km' },
  { meters: 10000, label: '10 km', short: '10 km' },
  { meters: 21097.5, label: 'Meia maratona', short: '21 km' },
  { meters: 42195, label: 'Maratona', short: '42 km' },
] as const

export interface Effort {
  seconds: number
  date: DayKey
  activityId: string
}

export interface DistanceEfforts {
  meters: number
  label: string
  short: string
  /** The fastest runs over this distance, one entry per run, fastest first. */
  efforts: Effort[]
}

const usable = (runs: Activity[]) => runs.filter((run) => !run.deleted && isOutdoorRun(run))

/**
 * Each distance some outdoor run reached, with the best time of each run over it, fastest first
 * (the first `limit`). Times come from the runs' samples: Garmin's own list isn't in its personal API.
 */
export function effortsByDistance(
  runs: Activity[],
  streams: Map<string, Pick<ActivityStream, 'step' | 'distance'>>,
  limit = 5,
): DistanceEfforts[] {
  const outdoor = usable(runs)
  return RECORD_DISTANCES.flatMap(({ meters, label, short }) => {
    const efforts: Effort[] = []
    for (const run of outdoor) {
      if ((run.distanceM ?? 0) < meters * 0.99) continue
      const stream = streams.get(run.id)
      const seconds = stream && bestEffort(stream, meters)
      if (seconds !== undefined) efforts.push({ seconds, date: run.date, activityId: run.id })
    }
    efforts.sort((a, b) => a.seconds - b.seconds)
    return efforts.length > 0 ? [{ meters, label, short, efforts: efforts.slice(0, limit) }] : []
  })
}

export interface LongRun {
  km: number
  seconds: number
  date: DayKey
  activityId: string
}

/** The longest outdoor runs, longest first. */
export function longestRuns(runs: Activity[], limit = 5): LongRun[] {
  return usable(runs)
    .filter((run) => (run.distanceM ?? 0) > 0)
    .sort((a, b) => (b.distanceM ?? 0) - (a.distanceM ?? 0))
    .slice(0, limit)
    .map((run) => ({ km: Math.round(run.distanceM! / 100) / 10, seconds: run.timerSec, date: run.date, activityId: run.id }))
}

export interface RunRecord extends Effort {
  label: string
  short: string
  meters: number
}

export interface Records {
  /** The best time of each distance some run reached, shortest distance first. */
  efforts: RunRecord[]
  longest?: LongRun
}

/** The best of each distance and the longest run, for the cards. */
export function personalRecords(runs: Activity[], streams: Map<string, Pick<ActivityStream, 'step' | 'distance'>>): Records {
  return {
    efforts: effortsByDistance(runs, streams, 1).map(({ meters, label, short, efforts: [best] }) => ({ meters, label, short, ...best })),
    longest: longestRuns(runs, 1)[0],
  }
}

/** 332.4 → "5:32" (minutes and seconds per km). */
export function formatPace(secondsPerKm: number): string {
  const total = Math.round(secondsPerKm)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
