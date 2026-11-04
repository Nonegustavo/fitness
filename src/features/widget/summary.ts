import { formatNumber } from '../../lib/format'

/** What the home-screen widget shows, already as text (the native side only displays it). */
export interface WidgetSummary {
  /** The day it's about (YYYY-MM-DD); on another day the widget shows dashes until the app opens. */
  date: string
  kcal: string
  kcalLabel: string
  water: string
  waterLabel: string
  workout: string
  workoutLabel: string
}

const liters = (ml: number) => `${formatNumber(ml / 1000, 1)} L`

export function widgetSummary({
  date,
  eatenKcal,
  goalKcal,
  waterMl,
  waterGoalMl,
  workout,
}: {
  date: string
  eatenKcal: number
  goalKcal?: number
  waterMl: number
  waterGoalMl: number
  /** The workout in progress, or the next template in the rotation. */
  workout?: { name: string; active: boolean }
}): WidgetSummary {
  const left = goalKcal === undefined ? undefined : goalKcal - eatenKcal
  return {
    date,
    kcal: formatNumber(left === undefined ? eatenKcal : Math.abs(left), 0),
    kcalLabel: left === undefined ? 'kcal hoje' : left >= 0 ? 'kcal faltam' : 'kcal acima',
    water: liters(waterMl),
    waterLabel: waterGoalMl > 0 ? `de ${liters(waterGoalMl)}` : 'de água',
    workout: workout?.name ?? '—',
    workoutLabel: workout ? (workout.active ? 'em andamento' : 'próximo treino') : 'sem ficha',
  }
}
