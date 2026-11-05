import { describe, expect, it } from 'vitest'
import type { AgendaItem } from '../calendar/agenda'
import { widgetSummary, widgetWorkouts } from './summary'

const goals = { kcal: 2400, protein: 160, carbs: 250, fat: 70 }

describe('widgetSummary', () => {
  it('shows what is left of the calories, each macro and the water against the goals', () => {
    expect(
      widgetSummary({
        date: '2026-11-04',
        eaten: { kcal: 1580, protein: 96, carbs: 120.4, fat: 52 },
        goals,
        waterMl: 1250,
        waterGoalMl: 3000,
        agenda: [{ date: '2026-11-04', title: 'PULL DAY', kind: 'gym', time: '18:30' }],
        next: 'PUSH DAY',
      }),
    ).toEqual({
      date: '2026-11-04',
      kcal: '820',
      kcalLabel: 'kcal faltam',
      kcalDetail: '1.580 de 2.400 kcal',
      kcalProgress: 658,
      kcalOver: false,
      carbs: '120/250g',
      carbsProgress: 482,
      protein: '96/160g',
      proteinProgress: 600,
      fat: '52/70g',
      fatProgress: 743,
      water: '1,3/3 L',
      waterProgress: 417,
      agenda: '[{"date":"2026-11-04","title":"PULL DAY","kind":"gym","time":"18:30"}]',
      next: 'PUSH DAY',
    })
  })

  it('fills a bar at most once and hides the bars without a goal', () => {
    expect(
      widgetSummary({ date: 'd', eaten: { kcal: 2600, protein: 200, carbs: 0, fat: 0 }, goals, waterMl: 0, waterGoalMl: 3000, agenda: [] }),
    ).toMatchObject({ kcal: '200', kcalLabel: 'kcal acima', kcalProgress: 1000, kcalOver: true, proteinProgress: 1000, next: '' })
    expect(
      widgetSummary({ date: 'd', eaten: { kcal: 900, protein: 40, carbs: 100, fat: 30 }, waterMl: 500, waterGoalMl: 0, agenda: [] }),
    ).toMatchObject({
      kcal: '900',
      kcalLabel: 'kcal hoje',
      kcalDetail: 'sem meta de calorias',
      kcalProgress: -1,
      protein: '40g',
      proteinProgress: -1,
      water: '0,5 L',
      waterProgress: -1,
    })
  })
})

describe('widgetWorkouts', () => {
  it('keeps what is still ahead with its time, and the workout in progress', () => {
    const item = (changes: Partial<AgendaItem>): AgendaItem => ({
      key: changes.title ?? 'x',
      date: '2026-11-05',
      kind: 'gym',
      title: 'x',
      status: 'planned',
      ...changes,
    })
    const plan = { id: 'p', date: '2026-11-06', templateId: 't', time: '07:15', updatedAt: 1, deleted: 0, dirty: 0 } as const
    expect(
      widgetWorkouts([
        item({ title: 'LEG DAY', status: 'done' }),
        item({ title: 'PUSH DAY', status: 'active' }),
        item({ title: 'Descanso', kind: 'rest' }),
        item({ title: 'Rodagem', kind: 'run', date: '2026-11-06', event: { date: '2026-11-06', title: 'Rodagem', time: new Date(2026, 10, 6, 6, 30).getTime() } }),
        item({ title: 'PULL DAY', date: '2026-11-06', plan }),
        item({ title: 'Caminhada de 40 min', kind: 'walk', date: '2026-11-07', plan: { id: 'walk-2026-11-07', date: '2026-11-07', kind: 'walk', time: '07:00', targetMin: 40, updatedAt: 0, deleted: 0, dirty: 0 } }),
      ]),
    ).toEqual([
      { date: '2026-11-05', title: 'PUSH DAY', kind: 'gym', active: true },
      { date: '2026-11-06', title: 'Rodagem', kind: 'run', time: '06:30' },
      { date: '2026-11-06', title: 'PULL DAY', kind: 'gym', time: '07:15' },
      // A walk keeps its own kind, never a run's.
      { date: '2026-11-07', title: 'Caminhada de 40 min', kind: 'walk', time: '07:00' },
    ])
  })
})
