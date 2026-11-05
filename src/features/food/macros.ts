import type { Nutrients } from '../../db/types'

export type MacroKey = 'carbs' | 'protein' | 'fat'

/** The three macros, always in this order and with these colors (--macro-* in index.css). */
export const MACROS: { key: MacroKey; label: string; short: string; color: string; kcalPerGram: number }[] = [
  { key: 'carbs', label: 'Carboidratos', short: 'C', color: 'var(--macro-carbs)', kcalPerGram: 4 },
  { key: 'protein', label: 'Proteína', short: 'P', color: 'var(--macro-protein)', kcalPerGram: 4 },
  { key: 'fat', label: 'Gorduras', short: 'G', color: 'var(--macro-fat)', kcalPerGram: 9 },
]

export type MacroShares = Record<MacroKey, number>

/**
 * How the energy of the macros splits between them (fractions that add up to 1), from 4/4/9 kcal per
 * gram. Undefined when there are no macros at all (water, coffee).
 */
export function macroShares(macros: Pick<Nutrients, MacroKey>): MacroShares | undefined {
  const kcal = MACROS.map(({ key, kcalPerGram }) => Math.max(macros[key], 0) * kcalPerGram)
  const total = kcal[0] + kcal[1] + kcal[2]
  if (total <= 0) return undefined
  return { carbs: kcal[0] / total, protein: kcal[1] / total, fat: kcal[2] / total }
}

/** Fractions as whole percentages that still add up to 100 (largest remainder). */
export function roundShares(shares: MacroShares): MacroShares {
  const keys = MACROS.map(({ key }) => key)
  const raw = keys.map((key) => shares[key] * 100)
  const floors = raw.map(Math.floor)
  let missing = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = raw.map((value, i) => [value - floors[i], i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (missing <= 0) break
    floors[i] += 1
    missing -= 1
  }
  return { carbs: floors[0], protein: floors[1], fat: floors[2] }
}
