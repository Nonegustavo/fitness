import { describe, expect, it } from 'vitest'
import { widgetSummary } from './summary'

describe('widgetSummary', () => {
  it('shows what is left of the calories, the water and the next workout', () => {
    expect(
      widgetSummary({ date: '2026-11-04', eatenKcal: 1580, goalKcal: 2400, waterMl: 1250, waterGoalMl: 3000, workout: { name: 'B', active: false } }),
    ).toEqual({
      date: '2026-11-04',
      kcal: '820',
      kcalLabel: 'kcal faltam',
      water: '1,3 L',
      waterLabel: 'de 3 L',
      workout: 'B',
      workoutLabel: 'próximo treino',
    })
  })

  it('says when the calories went over, or counts them without a goal', () => {
    expect(widgetSummary({ date: 'd', eatenKcal: 2600, goalKcal: 2400, waterMl: 0, waterGoalMl: 3000 })).toMatchObject({
      kcal: '200',
      kcalLabel: 'kcal acima',
      workout: '—',
      workoutLabel: 'sem ficha',
    })
    expect(widgetSummary({ date: 'd', eatenKcal: 900, waterMl: 0, waterGoalMl: 0 })).toMatchObject({ kcal: '900', kcalLabel: 'kcal hoje' })
  })
})
