import type { FoodLog, Habit, HabitLog, MacroGoals, WaterLog } from '../../db/types'
import { shiftDay, type DayKey } from '../../lib/dates'
import { formatClock, formatNumber } from '../../lib/format'
import { habitLogId, isSuccess } from '../habits/habits'
import type { Records } from '../running/running'

/** The goals kept day after day that count as a streak. */
export type StreakKind = 'water' | 'protein' | 'habits'

export const STREAK_LABELS: Record<StreakKind, string> = {
  water: 'Água na meta',
  protein: 'Proteína na meta',
  habits: 'Todos os hábitos',
}

/** How far back a streak is counted (enough for the last milestone). */
export const STREAK_DAYS = 120

/** The streak lengths worth a party. */
export const MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100]

export interface Streak {
  /** Days in a row meeting the goal, up to today. */
  count: number
  /** Whether today is already met (or else the streak runs up to yesterday, still alive). */
  today: boolean
}

/**
 * Days in a row meeting a goal, up to today. Today only counts once it's met, so a goal not met
 * yet today doesn't break yesterday's streak.
 */
export function dayStreak(met: (date: DayKey) => boolean, today: DayKey, maxDays = STREAK_DAYS): Streak {
  const metToday = met(today)
  let day = metToday ? today : shiftDay(today, -1)
  let count = 0
  while (count < maxDays && met(day)) {
    count++
    day = shiftDay(day, -1)
  }
  return { count, today: metToday }
}

export interface StreakSources {
  water: Pick<WaterLog, 'date' | 'ml'>[]
  waterGoalMl: number
  foodLogs: Pick<FoodLog, 'date' | 'nutrients'>[]
  /** The goals of a day (training days may differ); undefined without nutrition goals. */
  goalOn: (date: DayKey) => MacroGoals | undefined
  habits: Habit[]
  habitLogs: Pick<HabitLog, 'id' | 'value'>[]
}

function sumBy<T>(items: T[], key: (item: T) => DayKey, value: (item: T) => number): Map<DayKey, number> {
  const totals = new Map<DayKey, number>()
  for (const item of items) totals.set(key(item), (totals.get(key(item)) ?? 0) + value(item))
  return totals
}

/** Each streak as of today; a kind without a goal set (or without habits) is left out. */
export function streaks(s: StreakSources, today: DayKey): Partial<Record<StreakKind, Streak>> {
  const result: Partial<Record<StreakKind, Streak>> = {}
  if (s.waterGoalMl > 0) {
    const water = sumBy(s.water, (log) => log.date, (log) => log.ml)
    result.water = dayStreak((date) => (water.get(date) ?? 0) >= s.waterGoalMl, today)
  }
  if (s.goalOn(today)) {
    const protein = sumBy(s.foodLogs, (log) => log.date, (log) => log.nutrients.protein)
    result.protein = dayStreak((date) => {
      const goal = s.goalOn(date)?.protein
      return goal !== undefined && goal > 0 && (protein.get(date) ?? 0) >= goal
    }, today)
  }
  const active = s.habits.filter((habit) => !habit.archived)
  if (active.length > 0) {
    const values = new Map(s.habitLogs.map((log) => [log.id, log.value]))
    result.habits = dayStreak((date) => {
      const due = active.filter((habit) => habit.startDate <= date)
      // A day only counts once something was logged on it: an empty day isn't a kept one.
      const logged = due.some((habit) => values.has(habitLogId(habit.id, date)))
      return logged && due.every((habit) => isSuccess(habit, values.get(habitLogId(habit.id, date))))
    }, today)
  }
  return result
}

const MILESTONE_TEXT: Record<StreakKind, (count: number) => string> = {
  water: (count) => `🔥 ${count} dias seguidos batendo a meta de água!`,
  protein: (count) => `🔥 ${count} dias seguidos na meta de proteína!`,
  habits: (count) => `🔥 ${count} dias seguidos com todos os hábitos!`,
}

/** The party for a streak that reached a milestone today; undefined otherwise. */
export function milestoneMessage(kind: StreakKind, streak: Streak | undefined): string | undefined {
  if (!streak?.today || !MILESTONES.includes(streak.count)) return undefined
  return MILESTONE_TEXT[kind](streak.count)
}

/** The running records as last seen: the best time per distance (meters) and the longest run. */
export interface RecordSnapshot {
  best: Record<string, number>
  longestKm?: number
}

export const snapshotOf = (records: Records): RecordSnapshot => ({
  best: Object.fromEntries(records.efforts.map((effort) => [String(effort.meters), effort.seconds])),
  longestKm: records.longest?.km,
})

/** A record counts as news when its run is this recent (older ones come from importing history). */
const RECENT_DAYS = 7

/**
 * What beat the records last seen, from runs of the last days: a faster time over a distance, a
 * first time over one, or the longest run. Records from older runs update quietly.
 */
export function recordNews(previous: RecordSnapshot, records: Records, today: DayKey): string[] {
  const recent = (date: DayKey) => date >= shiftDay(today, -RECENT_DAYS)
  const news: string[] = []
  for (const effort of records.efforts) {
    const before = previous.best[String(effort.meters)]
    if (!recent(effort.date) || (before !== undefined && effort.seconds >= before - 0.5)) continue
    news.push(
      before === undefined
        ? `🏅 Primeira vez nos ${effort.short}: ${formatClock(effort.seconds)}!`
        : `🏆 Novo recorde nos ${effort.short}: ${formatClock(effort.seconds)}!`,
    )
  }
  const longest = records.longest
  if (longest && recent(longest.date) && previous.longestKm !== undefined && longest.km > previous.longestKm) {
    news.push(`🏆 Sua corrida mais longa: ${formatNumber(longest.km, 1)} km!`)
  }
  return news
}
