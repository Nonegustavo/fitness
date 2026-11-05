import { describe, expect, it } from 'vitest'
import type { Habit, HabitLog, Pain, Settings } from '../../db/types'
import type { Sources } from '../insights/metrics'
import { buildContext } from './context'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const TODAY = '2026-11-03'

const settings: Settings = { id: 'settings', waterGoalMl: 3000, measurementSites: [], ...meta }
const empty: Sources = {
  health: [],
  weights: [],
  foodLogs: [],
  waterLogs: [],
  habits: [],
  habitLogs: [],
  activities: [],
  sessions: [],
  journal: [],
}
const sun: Habit = {
  id: 'sun',
  name: 'Sol pela manhã',
  kind: 'check',
  polarity: 'good',
  startDate: '2026-10-01',
  archived: 0,
  order: 0,
  time: '07:00',
  ...meta,
}
const log = (date: string, value: number, extra: Partial<HabitLog> = {}): HabitLog => ({
  id: `sun:${date}`,
  habitId: 'sun',
  date,
  value,
  ...meta,
  ...extra,
})
const shin: Pain = {
  id: 'shin',
  name: 'canela direita',
  start: '2026-10-31',
  scores: { '2026-10-31': 6, '2026-11-02': 4 },
  ...meta,
}

const build = (sources: Sources) => buildContext({ sources, settings, planned: null, today: TODAY, now: new Date(2026, 10, 3, 7, 40) })

describe('the habits in the analysis', () => {
  const text = build({
    ...empty,
    habits: [sun],
    habitLogs: [log('2026-11-01', 1), log('2026-11-02', 0, { skipped: 1, note: 'chuva' }), log('2026-10-31', 0, { skipped: 1 })],
  })

  it('says when the habit is done', () => {
    expect(text).toContain('- Hábito: Sol pela manhã (fazer, às 07:00).')
  })

  it('tells a skipped day apart, with its reason', () => {
    expect(text).toContain('hábitos: Sol pela manhã (pulado: chuva)')
    expect(text).toContain('hábitos: Sol pela manhã (pulado)')
    expect(text).toContain('hábitos: Sol pela manhã sim')
  })

  it('leaves the skipped days out of the rate, and says how many', () => {
    expect(text).toMatch(/Hábito «Sol pela manhã»: cumprido em \d+% dos dias das últimas 2 semanas \(sem contar 2 dias pulados\)/)
  })
})

describe('the pains in the analysis', () => {
  const text = build({ ...empty, pains: [shin] })

  it('puts the pains of each day under it, with the score carried over', () => {
    expect(text).toMatch(/- domingo 1\/11: .*\n {2}Dores \(de 1 a 10\): canela direita 6\/10/)
    expect(text).toMatch(/- terça 3\/11: .*\n {2}Dores \(de 1 a 10\): canela direita 4\/10/)
  })

  it('lists the pains going on with how they went', () => {
    expect(text).toContain(
      '## Dores e desconfortos (contadas no diário, de 1 a 10)\n- canela direita: desde 31/10 (4 dias), hoje 4/10; notas: 6 em 31/10, 4 em 2/11',
    )
  })
})
