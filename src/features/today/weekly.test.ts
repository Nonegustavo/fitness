import { describe, expect, it } from 'vitest'
import { beforeLabel, delta, rowsOf, stepSummary, summaryPeriod, summaryTitle, weekStats, type WeekSources, type WeekStats } from './weekly'

const meta = { updatedAt: 0, deleted: 0 as const, dirty: 0 as const }

describe('weekStats', () => {
  it('averages over the days with logs and counts days near the calorie goal', () => {
    const log = (date: string, kcal: number) => ({
      ...meta,
      id: date,
      date,
      meal: 'lunch' as const,
      time: 0,
      foodId: 'x',
      name: 'x',
      grams: 100,
      nutrients: { kcal, protein: 100, carbs: 0, fat: 0 },
    })
    const sources: WeekSources = {
      foodLogs: [log('2026-10-26', 2000), log('2026-10-27', 2500), log('2026-11-02', 9999)],
      sessions: [],
      activityDates: [],
      health: [{ ...meta, id: '2026-10-26', sleep: { totalSec: 7 * 3600 }, steps: 8000 }],
      weightTrend: [
        { date: '2026-10-25', value: 80 },
        { date: '2026-11-01', value: 79.5 },
      ],
      water: [],
      habits: [],
      habitLogs: [],
      goalOn: () => ({ kcal: 2100, protein: 150, carbs: 200, fat: 70 }),
    }
    const week = weekStats('2026-10-26', '2026-11-01', sources)
    expect(week.foodDays).toBe(2)
    expect(week.kcal).toBe(2250)
    expect(week.onTarget).toBe(1)
    expect(week.sleepHours).toBe(7)
    expect(week.weightChange).toBeCloseTo(-0.5)
    expect(week.waterL).toBeUndefined()
  })

  it('leaves the skipped days out of the habits', () => {
    const habit = {
      ...meta,
      id: 'sun',
      name: 'Sol',
      kind: 'check' as const,
      polarity: 'good' as const,
      startDate: '2026-10-01',
      archived: 0 as const,
      order: 0,
    }
    const log = (date: string, value: number, skipped?: 1) => ({ ...meta, id: `sun:${date}`, habitId: 'sun', date, value, skipped })
    const week = weekStats('2026-10-26', '2026-11-01', {
      foodLogs: [],
      sessions: [],
      activityDates: [],
      health: [],
      weightTrend: [],
      water: [],
      habits: [habit],
      // Done 3 days, skipped 3 (rain), missed 1: 3 of the 4 days that count.
      habitLogs: [
        log('2026-10-26', 1),
        log('2026-10-27', 0, 1),
        log('2026-10-28', 0, 1),
        log('2026-10-29', 1),
        log('2026-10-30', 0, 1),
        log('2026-10-31', 1),
      ],
      goalOn: () => undefined,
    })
    expect(week.habits).toBe(0.75)
  })

  it('counts a weekly habit as its week, met or not', () => {
    const habit = (id: string, times: number) => ({
      ...meta,
      id,
      name: id,
      kind: 'check' as const,
      polarity: 'good' as const,
      startDate: '2026-10-01',
      archived: 0 as const,
      order: 0,
      frequency: { times, per: 'week' as const },
    })
    const log = (habitId: string, date: string) => ({ ...meta, id: `${habitId}:${date}`, habitId, date, value: 1 })
    const sources: WeekSources = {
      foodLogs: [],
      sessions: [],
      activityDates: [],
      health: [],
      weightTrend: [],
      water: [],
      habits: [habit('run', 3), habit('gym', 2)],
      // Ran 3 days (met), went to the gym once (missed): 1 of 2 habits.
      habitLogs: [log('run', '2026-10-26'), log('run', '2026-10-28'), log('run', '2026-10-30'), log('gym', '2026-10-27')],
      goalOn: () => undefined,
    }
    expect(weekStats('2026-10-25', '2026-10-31', sources).habits).toBe(0.5)
  })
})

// Friday 13 November 2026.
const TODAY = '2026-11-13'

describe('summaryPeriod', () => {
  it('opens on the last complete week, compared with the one before', () => {
    expect(summaryPeriod('week', undefined, TODAY)).toEqual({
      grain: 'week',
      from: '2026-11-01',
      to: '2026-11-07',
      partial: false,
      before: { from: '2026-10-25', to: '2026-10-31' },
      canForward: false,
    })
  })

  it('takes any day of a week and never goes past the last complete one', () => {
    expect(summaryPeriod('week', '2026-10-21', TODAY)).toMatchObject({ from: '2026-10-18', to: '2026-10-24', canForward: true })
    expect(summaryPeriod('week', '2026-11-08', TODAY).from).toBe('2026-11-01')
    expect(summaryPeriod('week', 'lixo', TODAY).from).toBe('2026-11-01')
  })

  it('shows the month going on until today, against as many days of the month before', () => {
    expect(summaryPeriod('month', undefined, TODAY)).toEqual({
      grain: 'month',
      from: '2026-11-01',
      to: '2026-11-13',
      partial: true,
      before: { from: '2026-10-01', to: '2026-10-13' },
      canForward: false,
    })
    // 31 March against the whole of February.
    expect(summaryPeriod('month', undefined, '2027-03-31').before).toEqual({ from: '2027-02-01', to: '2027-02-28' })
  })

  it('compares a whole month with the whole month before', () => {
    expect(summaryPeriod('month', '2026-10-20', TODAY)).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-31',
      partial: false,
      before: { from: '2026-09-01', to: '2026-09-30' },
      canForward: true,
    })
  })

  it('steps to the period before and after', () => {
    const october = summaryPeriod('month', '2026-10-01', TODAY)
    expect(stepSummary(october, -1)).toBe('2026-09-01')
    expect(stepSummary(october, 1)).toBe('2026-11-01')
    expect(stepSummary(summaryPeriod('week', undefined, TODAY), -1)).toBe('2026-10-25')
  })

  it('names the period and what it is compared with', () => {
    const week = summaryPeriod('week', undefined, TODAY)
    expect(summaryTitle(week, TODAY)).toBe('Semana de 1/11 a 7/11')
    expect(beforeLabel(week)).toBe('comparada com a semana de 25/10 a 31/10')
    expect(summaryTitle(summaryPeriod('week', '2025-11-05', TODAY), TODAY)).toBe('Semana de 2/11/25 a 8/11/25')
    const october = summaryPeriod('month', '2026-10-05', TODAY)
    expect(summaryTitle(october, TODAY)).toBe('Outubro de 2026')
    expect(beforeLabel(october)).toBe('comparado com setembro')
    expect(beforeLabel(summaryPeriod('month', undefined, TODAY))).toBe('comparado com 1 a 13 de outubro')
    expect(beforeLabel(summaryPeriod('month', '2026-01-10', TODAY))).toBe('comparado com dezembro de 2025')
  })
})

describe('rowsOf', () => {
  const stats = (over: Partial<WeekStats>): WeekStats => ({
    from: '2026-11-01',
    to: '2026-11-07',
    foodDays: 0,
    workouts: 0,
    sets: 0,
    activities: 0,
    ...over,
  })

  it('signs the change, and leaves it out when the period before had no data', () => {
    expect(delta(2100, 2000)).toBe('+100')
    expect(delta(1.5, 2, 1, ' L')).toBe('−0,5 L')
    expect(delta(3, 3)).toBe('±0')
    expect(delta(3, undefined)).toBeUndefined()
  })

  it('compares each area with the week before', () => {
    const rows = rowsOf(
      stats({ workouts: 3, sets: 45, sleepHours: 7.5, kcal: 2100, protein: 150, onTarget: 4, foodDays: 6, steps: 9000, weightChange: -0.3 }),
      stats({ workouts: 2, sets: 30, sleepHours: 7, kcal: 2000, protein: 140, foodDays: 7, steps: 8000 }),
    )
    expect(rows.map((row) => [row.label, row.value, row.change])).toEqual([
      ['Musculação', '3 treinos', '+1'],
      ['Séries', '45', '+15'],
      ['Sono por noite', '7h30', '+30 min'],
      ['Calorias por dia', '2.100 kcal', '+100'],
      ['Proteína por dia', '150 g', '+10 g'],
      ['Dias na meta (±10%)', '4 de 6', undefined],
      ['Passos por dia', '9.000', '+1.000'],
      ['Peso (tendência)', '−0,3 kg', undefined],
    ])
  })

  it('names the totals of a month as such and counts its days with food', () => {
    const rows = rowsOf(stats({ workouts: 1, sets: 12, activities: 4, foodDays: 20 }), stats({ foodDays: 25, activities: 6 }), 'month')
    expect(rows.map((row) => [row.label, row.value, row.change])).toEqual([
      ['Dias com alimentação', '20', '−5'],
      ['Musculação no mês', '1 treino', '+1'],
      ['Séries no mês', '12', undefined],
      ['Outras atividades no mês', '4', '−2'],
    ])
  })

  it('has no rows for a period without records', () => {
    expect(rowsOf(stats({}), stats({}))).toEqual([])
    expect(rowsOf(stats({}), stats({}), 'month')).toEqual([])
  })
})
