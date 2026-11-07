import { describe, expect, it } from 'vitest'
import type { MeasurementEntry } from '../../db/types'
import { bmi, bmiClass, healthyGap, healthyWeights, latestReading, mifflinStJeor, navyBodyFat, navyEstimate } from './composition'

const INCH = 2.54

/** The Navy formula as the DoD publishes it in inches (DoDI 1308.3), an independent check of the metric one. */
const dodMale = (height: number, neck: number, abdomen: number) =>
  86.01 * Math.log10((abdomen - neck) / INCH) - 70.041 * Math.log10(height / INCH) + 36.76
const dodFemale = (height: number, neck: number, waist: number, hip: number) =>
  163.205 * Math.log10((waist + hip - neck) / INCH) - 97.684 * Math.log10(height / INCH) - 78.387

const entry = (date: string, values: Record<string, number>): MeasurementEntry => ({
  id: date,
  date,
  values,
  updatedAt: 1,
  deleted: 0,
  dirty: 0,
})

describe('BMI', () => {
  it('is weight over height squared, with the WHO class', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.86, 2)
    expect(bmiClass(bmi(70, 175))).toBe('Peso normal')
    expect(bmiClass(17)).toBe('Abaixo do peso')
    expect(bmiClass(27.3)).toBe('Sobrepeso')
    expect(bmiClass(31)).toBe('Obesidade grau I')
    expect(bmiClass(38)).toBe('Obesidade grau II')
    expect(bmiClass(41)).toBe('Obesidade grau III')
  })

  it('classes the number as shown, with one decimal', () => {
    expect(bmiClass(24.94)).toBe('Peso normal')
    expect(bmiClass(24.96)).toBe('Sobrepeso')
    expect(bmiClass(18.46)).toBe('Peso normal')
    expect(bmiClass(18.44)).toBe('Abaixo do peso')
  })

  it('gives the healthy weights of a height and how far a weight is from them', () => {
    const range = healthyWeights(175)
    expect(range.low).toBeCloseTo(56.66, 2)
    expect(range.high).toBeCloseTo(76.26, 2)
    expect(healthyGap(70, 175)).toBe(0)
    expect(healthyGap(80, 175)).toBeCloseTo(80 - 76.26, 2)
    expect(healthyGap(55, 175)).toBeCloseTo(55 - 56.66, 2)
    // BMI 24,93 shows as 24,9: inside, even if a hair over 24,9 × height².
    expect(healthyGap(24.93 * 1.75 ** 2, 175)).toBe(0)
  })
})

describe('navyBodyFat', () => {
  it('gives the known results for men and women', () => {
    expect(navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 50, waistCm: 96 })).toBeCloseTo(15.65, 2)
    expect(navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 32, waistCm: 72, hipCm: 98 })).toBeCloseTo(27.43, 2)
  })

  it('agrees with the DoD formula in inches', () => {
    for (const [height, neck, abdomen] of [
      [178, 38, 85],
      [180, 40, 90],
      [170, 36, 100],
      [177.8, 38.1, 86.36],
    ]) {
      const metric = navyBodyFat({ sex: 'male', heightCm: height, neckCm: neck, waistCm: abdomen })!
      expect(Math.abs(metric - dodMale(height, neck, abdomen))).toBeLessThan(0.5)
    }
    for (const [height, neck, waist, hip] of [
      [165, 32, 72, 98],
      [160, 34, 85, 105],
      [170, 31, 66, 92],
    ]) {
      const metric = navyBodyFat({ sex: 'female', heightCm: height, neckCm: neck, waistCm: waist, hipCm: hip })!
      expect(Math.abs(metric - dodFemale(height, neck, waist, hip))).toBeLessThan(0.5)
    }
  })

  it('refuses measures that cannot be right', () => {
    expect(navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 40, waistCm: 39 })).toBeUndefined()
    expect(navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 32, waistCm: 72 })).toBeUndefined()
    expect(navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 40, waistCm: 45 })).toBeUndefined()
  })
})

describe('navyEstimate', () => {
  const entries = [
    entry('2026-09-01', { neck: 39, waist: 88, abdomen: 93, hip: 101 }),
    entry('2026-10-25', { waist: 86.5 }),
    entry('2026-11-01', { abdomen: 91 }),
  ]

  it("takes each site's latest reading, the abdomen as a man's waist", () => {
    const result = navyEstimate({ sex: 'male', heightCm: 178, entries })
    expect(result.missing).toEqual([])
    expect(result.readings).toEqual([
      { site: 'neck', cm: 39, date: '2026-09-01' },
      { site: 'abdomen', cm: 91, date: '2026-11-01' },
    ])
    expect(result.percent).toBeCloseTo(navyBodyFat({ sex: 'male', heightCm: 178, neckCm: 39, waistCm: 91 })!, 6)
  })

  it("uses the narrowest waist and the hips for a woman", () => {
    const result = navyEstimate({ sex: 'female', heightCm: 165, entries })
    expect(result.readings.map((reading) => [reading.site, reading.cm])).toEqual([
      ['neck', 39],
      ['waist', 86.5],
      ['hip', 101],
    ])
    expect(result.percent).toBeDefined()
  })

  it('says what is missing', () => {
    expect(navyEstimate({ entries: [] }).missing).toEqual(['height', 'sex', 'neck', 'waist'])
    expect(navyEstimate({ sex: 'female', heightCm: 160, entries: [entry('2026-11-01', { neck: 31, waist: 70 })] }).missing).toEqual(['hip'])
    // A man with only the waist taken: it stands in for the abdomen.
    expect(navyEstimate({ sex: 'male', heightCm: 178, entries: [entry('2026-11-01', { neck: 38, waist: 84 })] }).readings[1].site).toBe('waist')
  })

  it('finds a site added again in Ajustes, under its new key', () => {
    expect(latestReading([entry('2026-11-01', { pescoco: 38.5 })], 'neck')).toEqual({ site: 'neck', cm: 38.5, date: '2026-11-01' })
  })
})

describe('mifflinStJeor', () => {
  it('matches the worked examples', () => {
    expect(mifflinStJeor({ weightKg: 80, heightCm: 180, age: 30, sex: 'male' })).toBe(1780)
    expect(mifflinStJeor({ weightKg: 60, heightCm: 165, age: 25, sex: 'female' })).toBeCloseTo(1345.25)
  })
})
