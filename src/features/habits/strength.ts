import type { Habit } from '../../db/types'
import { weekStart, type DayKey } from '../../lib/dates'
import { isSuccess, stepDay, weeklyTimes, weekResult, type HabitDays } from './habits'

/*
 * Habit strength, 0 to 1: the idea of Loop Habit Tracker's score, written anew. It is an
 * exponential moving average of how each period went, so every completion pulls it up, every miss
 * pulls it down, and one miss after a long run costs a few points instead of zeroing it:
 *
 *   S ← S + α·(x − S),   α = 1 − 2^(−1/h)
 *
 * starting at S = 0 on the habit's start. x is the period's result:
 *   - daily habits, per day: 1 when met, 0 when missed; a count to do earns its share of the goal
 *     (5 of 8 glasses, 0.625);
 *   - weekly habits, per week (Sunday to Saturday): to do, the share of the target done (2 of
 *     3 days, 0.67; at most 1); to avoid, 1 within the limit and 0 past it.
 * h is the half-life, after which the past weighs half: 14 days, or 4 weeks for weekly habits
 * (fewer results, so each one moves it more and the memory is longer). After a long run (S near
 * 100%) 1 missed day leaves 95% and 3 leave 86%; a missed week leaves 84%, a week 2 of 3 days 95%.
 * From scratch, two perfect weeks of a daily habit make 50% and four make 75%; four weeks of a
 * weekly one make 50%.
 *
 * Skipped days don't move it, nor do weeks set aside (every day skipped, or a first week started
 * too late to make it). Today, and the current week, only count once met, like the streaks.
 */

const DAILY_HALF_LIFE = 14
const WEEKLY_HALF_LIFE = 4

/** The history it reads: what's older weighs under 0,02% (2^-13 for a weekly habit). */
export const STRENGTH_DAYS = 364

const smoothing = (halfLife: number) => 1 - 2 ** (-1 / halfLife)

/** A day of a daily habit, 0 to 1. */
function dayScore(habit: Habit, value = 0): number {
  if (habit.polarity === 'good' && habit.kind === 'count') {
    const goal = habit.target ?? 1
    return goal > 0 ? Math.min(Math.max(value, 0) / goal, 1) : 1
  }
  return isSuccess(habit, value) ? 1 : 0
}

/** The habit's strength as of today, 0 to 1, from the days in `days` (enough with the last STRENGTH_DAYS). */
export function habitStrength(habit: Habit, days: HabitDays, today: DayKey): number {
  const window = stepDay(today, -STRENGTH_DAYS)
  const from = habit.startDate > window ? habit.startDate : window
  const times = weeklyTimes(habit)
  let score = 0

  if (times === undefined) {
    const alpha = smoothing(DAILY_HALF_LIFE)
    for (let day = from; day <= today; day = stepDay(day, 1)) {
      if (days.skipped.has(day)) continue
      const x = dayScore(habit, days.values.get(day))
      if (day === today && x < 1) continue
      score += alpha * (x - score)
    }
    return score
  }

  const alpha = smoothing(WEEKLY_HALF_LIFE)
  for (let week = weekStart(from); week <= today; week = stepDay(week, 7)) {
    const result = weekResult(habit, days, week, today)
    if (result.outcome === 'open' || result.outcome === 'aside') continue
    const x = habit.polarity === 'good' ? Math.min(result.count / times, 1) : result.met ? 1 : 0
    score += alpha * (x - score)
  }
  return score
}

/** "78%". */
export const strengthPercent = (strength: number): string => `${Math.round(strength * 100)}%`
