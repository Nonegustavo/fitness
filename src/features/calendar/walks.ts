import type { WalkRoutine, WorkoutPlan } from '../../db/types'
import { dayRange, parseDay, type DayKey } from '../../lib/dates'
import { formatDuration, formatNumber, parseDecimal } from '../../lib/format'

/**
 * The id of the weekly walk's plan on a day: the same on every device, so the user's change to that
 * day (or taking it off) syncs as one row instead of two devices making two walks.
 */
export const routineWalkId = (date: DayKey): string => `walk-${date}`

/** A row that stands for the weekly walk of its day: the user's change to it, or its removal when deleted. */
export const isRoutineDay = (plan: Pick<WorkoutPlan, 'id' | 'date'>): boolean => plan.id === routineWalkId(plan.date)

export const weekdayOf = (date: DayKey): number => parseDay(date).getDay()

/** "Caminhada de 40 min", "Caminhada de 3 km", or just "Caminhada". */
export function walkTitle(plan: Pick<WorkoutPlan, 'targetMin' | 'targetKm'>): string {
  if (plan.targetKm) return `Caminhada de ${formatNumber(plan.targetKm, 1)} km`
  if (plan.targetMin) return `Caminhada de ${formatDuration(plan.targetMin * 60_000)}`
  return 'Caminhada'
}

/**
 * The weekly walks from `from` to `to`: one on each of the routine's weekdays, from the day it
 * applies (today, when that isn't known), so the weeks before it don't fill with missed walks. A
 * day the user changed has its own row; a deleted one takes the day off. Those rows count only
 * on the routine's days.
 */
export function routineWalks(
  routine: WalkRoutine | undefined,
  plans: WorkoutPlan[],
  from: DayKey,
  to: DayKey,
  today: DayKey,
): WorkoutPlan[] {
  if (!routine?.days.length) return []
  const since = routine.since ?? today
  const rows = new Map(plans.filter(isRoutineDay).map((plan) => [plan.id, plan]))
  return dayRange(since > from ? since : from, to).flatMap((date): WorkoutPlan[] => {
    if (!routine.days.includes(weekdayOf(date))) return []
    const id = routineWalkId(date)
    const row = rows.get(id)
    if (row) return row.deleted ? [] : [row]
    return [
      {
        id,
        date,
        kind: 'walk',
        ...(routine.time && { time: routine.time }),
        ...(routine.targetMin && { targetMin: routine.targetMin }),
        ...(routine.targetKm && { targetKm: routine.targetKm }),
        updatedAt: 0,
        deleted: 0,
        dirty: 0,
      },
    ]
  })
}

export interface WalkFields {
  /** "07:00". */
  time?: string
  targetMin?: number
  targetKm?: number
}

/**
 * The weekly walks as the form saves them. The day it applies from moves to today when the days
 * change, so the weeks before don't get walks they never had; with no day left, there's no routine.
 */
export function nextRoutine(
  current: WalkRoutine | undefined,
  days: number[],
  fields: WalkFields,
  today: DayKey,
): WalkRoutine | undefined {
  const chosen = [...new Set(days)].filter((day) => day >= 0 && day <= 6).sort((a, b) => a - b)
  if (chosen.length === 0) return undefined
  const sameDays = !!current && current.days.length === chosen.length && chosen.every((day) => current.days.includes(day))
  return {
    days: chosen,
    ...(fields.time && { time: fields.time }),
    ...(fields.targetMin && { targetMin: fields.targetMin }),
    ...(fields.targetKm && { targetKm: fields.targetKm }),
    since: sameDays && current.since ? current.since : today,
  }
}

/** The walk's goal as the form has it: none, minutes or kilometers. */
export type WalkGoal = 'none' | 'min' | 'km'

export const goalOf = (plan: Pick<WorkoutPlan, 'targetMin' | 'targetKm'> | undefined): WalkGoal =>
  plan?.targetKm ? 'km' : plan?.targetMin ? 'min' : 'none'

/** The target typed in the form ("40", "3,5"), or null when it doesn't make sense. */
export function walkTarget(goal: WalkGoal, text: string): Pick<WalkFields, 'targetMin' | 'targetKm'> | null {
  if (goal === 'none') return {}
  const value = parseDecimal(text)
  if (value === undefined || !(value > 0)) return null
  if (goal === 'min') return value <= 600 ? { targetMin: Math.round(value) } : null
  return value <= 100 ? { targetKm: Math.round(value * 100) / 100 } : null
}

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "todo dia", "seg a sex", "fim de semana" or "seg, qua e sex". */
export function weekdaysText(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  if (sorted.length === 7) return 'todo dia'
  if (sorted.join() === '1,2,3,4,5') return 'seg a sex'
  if (sorted.join() === '0,6') return 'fim de semana'
  const names = sorted.map((day) => WEEKDAY_SHORT[day])
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : (names[0] ?? '')
}
