import type { FoodUnit, Nutrients } from '../../db/types'
import { formatNumber } from '../../lib/format'
import { kcalFromMacros } from './nutrition'

export type WarningCode = 'kcal' | 'dense' | 'sum'

/** Something in a food's values worth a second look, in words for the user. */
export interface FoodWarning {
  code: WarningCode
  text: string
}

// The calories are "far" from what the macros give when both hold: a light food is off by a large
// share for a few kcal, and a dense one by many kcal for a small share (fiber, a rounded label).
const KCAL_GAP = 40
const KCAL_SHARE = 0.25
/** Pure fat has 900 kcal in 100 g: nothing has more. */
const MAX_KCAL = 900

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits

/**
 * What looks wrong in a food's values, from the numbers alone: calories far from what the macros give
 * (4 kcal per gram of carbs and of protein, 9 per gram of fat) and, for a food measured in grams, more
 * energy or more macros than 100 g can hold (a typo, or the values of a bigger amount saved as per
 * 100 g). A food measured in portions has one portion in `per100`, of any size, so only its calories
 * are checked against its macros.
 *
 * Values that add up but belong to something else (a 50 g portion saved as 100 g, protein and carbs
 * swapped) pass here: telling takes knowing the food, which is the AI review's part.
 */
export function foodWarnings(
  per100: Pick<Nutrients, 'kcal' | 'carbs' | 'protein' | 'fat'>,
  { unit }: { unit?: FoodUnit } = {},
): FoodWarning[] {
  const warnings: FoodWarning[] = []
  const fromMacros = kcalFromMacros(per100)
  const gap = Math.abs(per100.kcal - fromMacros)
  if (gap > KCAL_GAP && gap > fromMacros * KCAL_SHARE) {
    warnings.push({
      code: 'kcal',
      text: 'As calorias não batem com os macros. Confira: fibras ou álcool podem explicar a diferença.',
    })
  }
  if (unit === 'portion') return warnings

  // Compared as they are shown: a portion's values turned into 100 g can come out as 100,00000000000001.
  const kcal = round(per100.kcal, 0)
  if (kcal > MAX_KCAL) {
    warnings.push({
      code: 'dense',
      text: `São ${formatNumber(kcal, 0)} kcal em 100 g: nem gordura pura passa de ${MAX_KCAL}.`,
    })
  }
  const sum = round(per100.carbs + per100.protein + per100.fat, 1)
  if (sum > 100) {
    warnings.push({ code: 'sum', text: `Carboidratos, proteína e gorduras somam ${formatNumber(sum)} g em 100 g.` })
  }
  return warnings
}
