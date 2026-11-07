import type { MeasurementEntry, Sex } from '../../db/types'
import type { DayKey } from '../../lib/dates'

/** The WHO's adult BMI classes, each up to (not including) `below`. */
export const BMI_CLASSES = [
  { below: 18.5, label: 'Abaixo do peso' },
  { below: 25, label: 'Peso normal' },
  { below: 30, label: 'Sobrepeso' },
  { below: 35, label: 'Obesidade grau I' },
  { below: 40, label: 'Obesidade grau II' },
  { below: Infinity, label: 'Obesidade grau III' },
] as const

/** The WHO's healthy BMI range, which gives the healthy weights for a height. */
export const HEALTHY_BMI = { low: 18.5, high: 24.9 } as const

/** Body mass index: weight over height squared (kg/m²). */
export const bmi = (weightKg: number, heightCm: number): number => weightKg / (heightCm / 100) ** 2

/** One decimal, as shown: the class and the range follow the number on the screen, so 24,96 is "25,0", Sobrepeso. */
const shown = (value: number) => Math.round(value * 10) / 10

export const bmiClass = (value: number): string => BMI_CLASSES.find((item) => shown(value) < item.below)!.label

/** The weights that put a height in the healthy BMI range. */
export function healthyWeights(heightCm: number): { low: number; high: number } {
  const squared = (heightCm / 100) ** 2
  return { low: HEALTHY_BMI.low * squared, high: HEALTHY_BMI.high * squared }
}

/** How far a weight is from the healthy range: negative kg below it, positive above it, 0 inside. */
export function healthyGap(weightKg: number, heightCm: number): number {
  const value = shown(bmi(weightKg, heightCm))
  const { low, high } = healthyWeights(heightCm)
  if (value < HEALTHY_BMI.low) return weightKg - low
  if (value > HEALTHY_BMI.high) return weightKg - high
  return 0
}

export interface NavyInput {
  sex: Sex
  heightCm: number
  neckCm: number
  /** Men: around the navel. Women: at the narrowest point. */
  waistCm: number
  /** Women only: at the widest point of the buttocks. */
  hipCm?: number
}

/**
 * Body fat (%) by the U.S. Navy's circumference method (Hodgdon & Beckett, 1984), in centimeters: the
 * body density from log10 of the girths and of the height, then Siri's 495 / density − 450. Undefined when
 * the measures can't be right (a waist smaller than the neck, a result out of what a body can have).
 */
export function navyBodyFat({ sex, heightCm, neckCm, waistCm, hipCm }: NavyInput): number | undefined {
  const girth = sex === 'male' ? waistCm - neckCm : waistCm + (hipCm ?? Number.NaN) - neckCm
  if (!(girth > 0) || !(heightCm > 0)) return undefined
  const density =
    sex === 'male'
      ? 1.0324 - 0.19077 * Math.log10(girth) + 0.15456 * Math.log10(heightCm)
      : 1.29579 - 0.35004 * Math.log10(girth) + 0.221 * Math.log10(heightCm)
  const percent = 495 / density - 450
  return Number.isFinite(percent) && percent >= 2 && percent <= 70 ? percent : undefined
}

/**
 * Resting energy (BMR) by Mifflin–St Jeor (1990), kcal a day: 10 × kg + 6,25 × cm − 5 × age, plus 5 for
 * men and minus 161 for women.
 */
export const mifflinStJeor = ({ weightKg, heightCm, age, sex }: { weightKg: number; heightCm: number; age: number; sex: Sex }): number =>
  10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161)

/**
 * The measurement sites the Navy formula reads, by their keys in the form. The second key is the one a
 * site gets when removed and added again in Ajustes ("Pescoço" becomes "pescoco").
 */
const SITE_KEYS = {
  neck: ['neck', 'pescoco'],
  waist: ['waist', 'cintura'],
  abdomen: ['abdomen', 'abdome'],
  hip: ['hip', 'quadril'],
} as const

export type NavySite = keyof typeof SITE_KEYS

export interface SiteReading {
  site: NavySite
  cm: number
  date: DayKey
}

/** The newest reading of a site, from measurement sessions in date order. */
export function latestReading(entries: MeasurementEntry[], site: NavySite): SiteReading | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    for (const key of SITE_KEYS[site]) {
      const cm = entries[i].values[key]
      if (cm !== undefined && cm > 0) return { site, cm, date: entries[i].date }
    }
  }
  return undefined
}

/** What the formula still needs: the height, the sex, or a measure (`waist` is the abdomen for men). */
export type NavyNeed = 'height' | 'sex' | 'neck' | 'waist' | 'hip'

export interface NavyEstimate {
  percent?: number
  /** The measures it used (or will use), each with its day. */
  readings: SiteReading[]
  missing: NavyNeed[]
}

/**
 * The Navy estimate from the latest measurements. Men's waist goes around the navel, the form's
 * "Abdômen" (its "Cintura" when there's none); women's goes at the narrowest point, "Cintura" (or
 * "Abdômen"), and their hips count too.
 */
export function navyEstimate({
  sex,
  heightCm,
  entries,
}: {
  sex?: Sex
  heightCm?: number
  entries: MeasurementEntry[]
}): NavyEstimate {
  const missing: NavyNeed[] = []
  if (!heightCm) missing.push('height')
  if (!sex) missing.push('sex')
  const neck = latestReading(entries, 'neck')
  const order: NavySite[] = sex === 'female' ? ['waist', 'abdomen'] : ['abdomen', 'waist']
  const waist = latestReading(entries, order[0]) ?? latestReading(entries, order[1])
  const hip = sex === 'female' ? latestReading(entries, 'hip') : undefined
  if (!neck) missing.push('neck')
  if (!waist) missing.push('waist')
  if (sex === 'female' && !hip) missing.push('hip')
  const readings = [neck, waist, hip].filter((reading): reading is SiteReading => reading !== undefined)
  if (missing.length > 0 || !sex || !heightCm || !neck || !waist) return { readings, missing }
  return { percent: navyBodyFat({ sex, heightCm, neckCm: neck.cm, waistCm: waist.cm, hipCm: hip?.cm }), readings, missing }
}
