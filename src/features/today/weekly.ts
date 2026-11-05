import type { DailyHealth, FoodLog, Habit, HabitLog, MacroGoals, WaterLog, WorkoutSession } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import type { DayValue } from '../../lib/stats'
import { daysByHabit, NO_DAYS, successRate } from '../habits/habits'
import { summarize } from '../training/stats'

export interface WeekStats {
  from: DayKey
  to: DayKey
  /** Days with food logged. */
  foodDays: number
  /** Averages over the days with food logged. */
  kcal?: number
  protein?: number
  /** Days with food logged within 10% of that day's calorie goal. */
  onTarget?: number
  workouts: number
  sets: number
  activities: number
  sleepHours?: number
  steps?: number
  /** Weight trend at the end of the week minus at its start. */
  weightChange?: number
  /** Average liters a day, over the days with water logged. */
  waterL?: number
  /**
   * Share of habit-days met, the skipped ones left out, averaged over the habits; a weekly habit
   * counts as its week, met or not.
   */
  habits?: number
}

export interface WeekSources {
  foodLogs: FoodLog[]
  sessions: WorkoutSession[]
  activityDates: DayKey[]
  health: DailyHealth[]
  weightTrend: DayValue[]
  water: WaterLog[]
  habits: Habit[]
  habitLogs: HabitLog[]
  /** The calorie goal of a day (training days may differ). */
  goalOn: (date: DayKey) => MacroGoals | undefined
}

const average = (values: number[]): number | undefined =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined

/** The trend at the latest point on or before a day. */
const trendAt = (trend: DayValue[], date: DayKey): number | undefined => {
  let found: number | undefined
  for (const point of trend) {
    if (point.date > date) break
    found = point.value
  }
  return found
}

/** Everything a week did, for the Sunday review against the week before. */
export function weekStats(from: DayKey, to: DayKey, s: WeekSources): WeekStats {
  const inWeek = (date: DayKey) => date >= from && date <= to

  const kcalByDay = new Map<DayKey, { kcal: number; protein: number }>()
  for (const log of s.foodLogs) {
    if (!inWeek(log.date)) continue
    const day = kcalByDay.get(log.date) ?? { kcal: 0, protein: 0 }
    kcalByDay.set(log.date, { kcal: day.kcal + log.nutrients.kcal, protein: day.protein + log.nutrients.protein })
  }
  const foodDays = [...kcalByDay.entries()]
  const withGoal = foodDays.filter(([date]) => s.goalOn(date))
  const onTarget = withGoal.length
    ? withGoal.filter(([date, day]) => Math.abs(day.kcal - s.goalOn(date)!.kcal) <= s.goalOn(date)!.kcal * 0.1).length
    : undefined

  const sessions = s.sessions.filter((session) => session.endedAt && inWeek(session.date))
  const health = s.health.filter((day) => inWeek(day.id))

  const waterByDay = new Map<DayKey, number>()
  for (const log of s.water) if (inWeek(log.date)) waterByDay.set(log.date, (waterByDay.get(log.date) ?? 0) + log.ml)

  const habitDays = daysByHabit(s.habitLogs)
  const rates = s.habits
    .filter((habit) => !habit.archived)
    .flatMap((habit) => {
      const rate = successRate(habit, habitDays.get(habit.id) ?? NO_DAYS, from, to)
      return rate === undefined ? [] : [rate]
    })

  const start = trendAt(s.weightTrend, from)
  const end = trendAt(s.weightTrend, to)
  return {
    from,
    to,
    foodDays: foodDays.length,
    kcal: average(foodDays.map(([, day]) => day.kcal)),
    protein: average(foodDays.map(([, day]) => day.protein)),
    onTarget,
    workouts: sessions.length,
    sets: sessions.reduce((total, session) => total + summarize(session).sets, 0),
    activities: s.activityDates.filter(inWeek).length,
    sleepHours: average(health.flatMap((day) => (day.sleep ? [day.sleep.totalSec / 3600] : []))),
    steps: average(health.flatMap((day) => (day.steps ? [day.steps] : []))),
    weightChange: start !== undefined && end !== undefined && start !== end ? end - start : undefined,
    waterL: average([...waterByDay.values()].map((ml) => ml / 1000)),
    habits: average(rates),
  }
}
