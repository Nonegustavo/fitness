import { describe, expect, it } from 'vitest'
import java from '../../../android/app/src/main/java/io/github/nonegustavo/fitness/QuickWidget.java?raw'
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
        normalGoals: goals,
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
      emptyKcal: '2.400',
      emptyKcalLabel: 'kcal faltam',
      emptyKcalDetail: '0 de 2.400 kcal',
      emptyCarbs: '0/250g',
      emptyProtein: '0/160g',
      emptyFat: '0/70g',
      emptyWater: '0/3 L',
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

describe('the empty day, which the widget starts a new day with', () => {
  const eaten = { kcal: 2850, protein: 170, carbs: 340, fat: 80 }
  // A day with a workout has its own goals.
  const training = { kcal: 2700, protein: 160, carbs: 325, fat: 70 }

  it('has nothing eaten or drunk yet, against the goals of a day without a workout', () => {
    const summary = widgetSummary({ date: 'd', eaten, goals: training, normalGoals: goals, waterMl: 3200, waterGoalMl: 3000, agenda: [] })
    // Today went over its training-day goals; none of it carries into the next day.
    expect(summary).toMatchObject({ kcal: '150', kcalLabel: 'kcal acima', kcalDetail: '2.850 de 2.700 kcal', carbs: '340/325g', water: '3,2/3 L' })
    expect(summary).toMatchObject({
      emptyKcal: '2.400',
      emptyKcalLabel: 'kcal faltam',
      emptyKcalDetail: '0 de 2.400 kcal',
      emptyCarbs: '0/250g',
      emptyProtein: '0/160g',
      emptyFat: '0/70g',
      emptyWater: '0/3 L',
    })
  })

  it('is all zeros without goals', () => {
    expect(widgetSummary({ date: 'd', eaten, waterMl: 3200, waterGoalMl: 0, agenda: [] })).toMatchObject({
      emptyKcal: '0',
      emptyKcalLabel: 'kcal hoje',
      emptyKcalDetail: 'sem meta de calorias',
      emptyCarbs: '0g',
      emptyProtein: '0g',
      emptyFat: '0g',
      emptyWater: '0 L',
    })
  })
})

describe('the native side of the widget', () => {
  // WidgetPlugin.kt keeps the keys QuickWidget lists and nothing else: a field missing there never
  // reaches the widget, and a key the app doesn't send is kept empty.
  it('keeps exactly the fields of the summary', () => {
    const keys = [.../String\[\] KEYS = \{([^}]*)\}/.exec(java)![1].matchAll(/"(\w+)"/g)].map((match) => match[1])
    const summary = widgetSummary({ date: 'd', eaten: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, waterMl: 0, waterGoalMl: 0, agenda: [] })
    expect(keys.sort()).toEqual(Object.keys(summary).sort())
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
    const race = { id: 'r', name: 'Rústica de Morungava', date: '2026-11-08', time: '08:00', updatedAt: 1, deleted: 0, dirty: 0 } as const
    expect(
      widgetWorkouts([
        item({ title: 'LEG DAY', status: 'done' }),
        item({ title: 'PUSH DAY', status: 'active' }),
        item({ title: 'Descanso', kind: 'rest' }),
        item({ title: 'Rodagem', kind: 'run', date: '2026-11-06', event: { date: '2026-11-06', title: 'Rodagem', time: new Date(2026, 10, 6, 6, 30).getTime() } }),
        item({ title: 'PULL DAY', date: '2026-11-06', plan }),
        item({ title: 'Caminhada de 40 min', kind: 'walk', date: '2026-11-07', plan: { id: 'walk-2026-11-07', date: '2026-11-07', kind: 'walk', time: '07:00', targetMin: 40, updatedAt: 0, deleted: 0, dirty: 0 } }),
        item({ title: 'Rústica de Morungava', kind: 'run', date: '2026-11-08', race }),
      ]),
    ).toEqual([
      { date: '2026-11-05', title: 'PUSH DAY', kind: 'gym', active: true },
      { date: '2026-11-06', title: 'Rodagem', kind: 'run', time: '06:30' },
      { date: '2026-11-06', title: 'PULL DAY', kind: 'gym', time: '07:15' },
      // A walk keeps its own kind, never a run's.
      { date: '2026-11-07', title: 'Caminhada de 40 min', kind: 'walk', time: '07:00' },
      // A race of the app's list, at the time it starts.
      { date: '2026-11-08', title: 'Rústica de Morungava', kind: 'run', time: '08:00' },
    ])
  })
})
