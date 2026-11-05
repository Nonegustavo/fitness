import type { Activity } from '../../db/types'
import { checkSummary, checkWorkout } from '../activities/compliance'
import { weatherText } from '../activities/weather'

/**
 * More of a watch workout for the daily analysis: how the coach's planned steps went against the
 * laps ("6 de 8 tiros no alvo (2 mais lentos)", or that the laps don't line up, so they aren't read
 * as the steps) and the weather it was done in.
 */
export function workoutExtras(activity: Activity): string[] {
  const parts: string[] = []
  const check = checkWorkout(activity)
  if (check) parts.push(`execução do treino planejado: ${checkSummary(check)}`)
  if (activity.weather) parts.push(`clima: ${weatherText(activity.weather, { condition: true })}`)
  return parts
}
