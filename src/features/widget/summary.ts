import type { MacroGoals, Nutrients } from '../../db/types'
import { formatTime } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { shortTitle, type AgendaItem, type AgendaKind } from '../calendar/agenda'

/** A workout ahead; the widget shows the first one from the current day on. */
export interface WidgetWorkout {
  date: string
  title: string
  kind: AgendaKind
  /** "18:30", when it has a time. */
  time?: string
  /** The gym workout in progress. */
  active?: boolean
}

/**
 * What the home-screen widget shows, already as text (the native side only displays it), and how
 * full each bar is: 0–1000, or -1 to hide a bar that has no goal.
 */
export interface WidgetSummary {
  /** The day it's about (YYYY-MM-DD); on another day the widget shows dashes until the app opens. */
  date: string
  kcal: string
  kcalLabel: string
  kcalDetail: string
  kcalProgress: number
  kcalOver: boolean
  carbs: string
  carbsProgress: number
  protein: string
  proteinProgress: number
  fat: string
  fatProgress: number
  water: string
  waterProgress: number
  /** The workouts ahead (WidgetWorkout[]) as JSON, so the next one is still right after midnight. */
  agenda: string
  /** The rotation's next template, shown when nothing is scheduled. */
  next: string
}

const fill = (value: number, goal: number | undefined): number =>
  goal !== undefined && goal > 0 ? Math.round(Math.min(Math.max(value, 0) / goal, 1) * 1000) : -1

const grams = (value: number, goal: number | undefined): string =>
  goal !== undefined && goal > 0 ? `${formatNumber(value, 0)}/${formatNumber(goal, 0)}g` : `${formatNumber(value, 0)}g`

const liters = (ml: number) => formatNumber(ml / 1000, 1)

export function widgetSummary({
  date,
  eaten,
  goals,
  waterMl,
  waterGoalMl,
  agenda,
  next,
}: {
  date: string
  eaten: Pick<Nutrients, 'kcal' | 'protein' | 'carbs' | 'fat'>
  goals?: MacroGoals
  waterMl: number
  waterGoalMl: number
  agenda: WidgetWorkout[]
  next?: string
}): WidgetSummary {
  const goal = goals?.kcal
  const left = goal === undefined ? undefined : goal - eaten.kcal
  return {
    date,
    kcal: formatNumber(left === undefined ? eaten.kcal : Math.abs(left), 0),
    kcalLabel: left === undefined ? 'kcal hoje' : left >= 0 ? 'kcal faltam' : 'kcal acima',
    kcalDetail: goal === undefined ? 'sem meta de calorias' : `${formatNumber(eaten.kcal, 0)} de ${formatNumber(goal, 0)} kcal`,
    kcalProgress: fill(eaten.kcal, goal),
    kcalOver: left !== undefined && left < 0,
    carbs: grams(eaten.carbs, goals?.carbs),
    carbsProgress: fill(eaten.carbs, goals?.carbs),
    protein: grams(eaten.protein, goals?.protein),
    proteinProgress: fill(eaten.protein, goals?.protein),
    fat: grams(eaten.fat, goals?.fat),
    fatProgress: fill(eaten.fat, goals?.fat),
    water: waterGoalMl > 0 ? `${liters(waterMl)}/${liters(waterGoalMl)} L` : `${liters(waterMl)} L`,
    waterProgress: fill(waterMl, waterGoalMl),
    agenda: JSON.stringify(agenda),
    next: next ?? '',
  }
}

/** The workouts still ahead (and the one in progress), rest days left out. */
export function widgetWorkouts(items: AgendaItem[]): WidgetWorkout[] {
  return items
    .filter((item) => (item.status === 'planned' || item.status === 'active') && item.kind !== 'rest')
    .slice(0, 12)
    .map((item) => {
      const time = item.plan?.time ?? item.customTime ?? (item.event?.time !== undefined ? formatTime(item.event.time) : undefined)
      return {
        date: item.date,
        title: shortTitle(item),
        kind: item.kind,
        ...(time && { time }),
        ...(item.status === 'active' && { active: true }),
      }
    })
}
