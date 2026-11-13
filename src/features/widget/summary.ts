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
  /** The day it's about (YYYY-MM-DD); on another day the widget shows the empty day's texts below. */
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
  /**
   * A day with nothing eaten or drunk yet against the goals of a day without a workout (whether the
   * next day has one isn't known yet): what the widget shows from midnight until the app opens. Its
   * bars are empty; one without a goal stays hidden by the `…Progress` above.
   */
  emptyKcal: string
  emptyKcalLabel: string
  emptyKcalDetail: string
  emptyCarbs: string
  emptyProtein: string
  emptyFat: string
  emptyWater: string
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

type Intake = Pick<Nutrients, 'kcal' | 'protein' | 'carbs' | 'fat'>

const NOTHING: Intake = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

/** A day's texts and bars, from what was eaten and drunk against the goals. */
function dayTexts(eaten: Intake, goals: MacroGoals | undefined, waterMl: number, waterGoalMl: number) {
  const goal = goals?.kcal
  const left = goal === undefined ? undefined : goal - eaten.kcal
  return {
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
  }
}

export function widgetSummary({
  date,
  eaten,
  goals,
  normalGoals,
  waterMl,
  waterGoalMl,
  agenda,
  next,
}: {
  date: string
  eaten: Intake
  /** Today's goals: a training day's when there was a workout. */
  goals?: MacroGoals
  /** The goals of a day without a workout, for the empty day. */
  normalGoals?: MacroGoals
  waterMl: number
  waterGoalMl: number
  agenda: WidgetWorkout[]
  next?: string
}): WidgetSummary {
  const empty = dayTexts(NOTHING, normalGoals, 0, waterGoalMl)
  return {
    date,
    ...dayTexts(eaten, goals, waterMl, waterGoalMl),
    emptyKcal: empty.kcal,
    emptyKcalLabel: empty.kcalLabel,
    emptyKcalDetail: empty.kcalDetail,
    emptyCarbs: empty.carbs,
    emptyProtein: empty.protein,
    emptyFat: empty.fat,
    emptyWater: empty.water,
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
      const time = item.plan?.time ?? item.race?.time ?? item.customTime ?? (item.event?.time !== undefined ? formatTime(item.event.time) : undefined)
      return {
        date: item.date,
        title: shortTitle(item),
        kind: item.kind,
        ...(time && { time }),
        ...(item.status === 'active' && { active: true }),
      }
    })
}
