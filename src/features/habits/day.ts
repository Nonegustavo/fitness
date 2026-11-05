import type { Habit, HabitLog } from '../../db/types'
import { habitTime, isSkipped, isSuccess } from './habits'

/**
 * How a habit stands on a day: one to do is open or done, one to avoid is clear or happened, and
 * either can be skipped.
 */
export type DayState = 'open' | 'done' | 'clear' | 'happened' | 'skipped'

export function dayState(habit: Habit, log: Pick<HabitLog, 'value' | 'skipped'> | undefined): DayState {
  if (isSkipped(log)) return 'skipped'
  const value = log?.value ?? 0
  if (habit.polarity === 'bad') return value > 0 ? 'happened' : 'clear'
  return isSuccess(habit, value) ? 'done' : 'open'
}

/** 0: to do, with a time · 1: to do, without one · 2: to avoid, nothing logged · 3: settled. */
function group(habit: Habit, state: DayState): number {
  if (state === 'open') return habitTime(habit) ? 0 : 1
  return state === 'clear' ? 2 : 3
}

const LAST = '99:99'

/**
 * The day's list: what's still to do with a time (by time), then without one, then the habits to
 * avoid not logged, and at the end everything settled (done, skipped, happened). Within each, by
 * time and then the manual order. `logs` maps a habit id to its log of the day.
 */
export function orderForDay(habits: Habit[], logs: Map<string, Pick<HabitLog, 'value' | 'skipped'>>): Habit[] {
  return habits
    .map((habit) => ({ habit, group: group(habit, dayState(habit, logs.get(habit.id))), time: habitTime(habit) ?? LAST }))
    .sort((a, b) => a.group - b.group || a.time.localeCompare(b.time) || a.habit.order - b.habit.order)
    .map(({ habit }) => habit)
}

/** An order held on screen for a moment: the ids it had still in place, anything new at the end. */
export function keepOrder(held: string[], ids: string[]): string[] {
  const present = new Set(ids)
  const kept = held.filter((id) => present.has(id))
  const known = new Set(kept)
  return [...kept, ...ids.filter((id) => !known.has(id))]
}

/**
 * The day's goals: the habits to do that weren't skipped, and how many are done. A skipped habit
 * isn't asked for, so the day can be all done without it.
 */
export function dayGoals(
  habits: Habit[],
  logs: Map<string, Pick<HabitLog, 'value' | 'skipped'>>,
): { required: Habit[]; done: Habit[]; left: Habit[] } {
  const required = habits.filter((habit) => habit.polarity === 'good' && !isSkipped(logs.get(habit.id)))
  const done = required.filter((habit) => isSuccess(habit, logs.get(habit.id)?.value))
  return { required, done, left: required.filter((habit) => !done.includes(habit)) }
}
