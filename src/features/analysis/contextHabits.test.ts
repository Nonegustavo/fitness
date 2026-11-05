import { describe, expect, it } from 'vitest'
import type { Habit, HabitLog, Settings } from '../../db/types'
import type { Sources } from '../insights/metrics'
import { buildContext } from './context'
import { adherenceLines } from './contextParts'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
// A Wednesday; the week started on Sunday 11-01.
const TODAY = '2026-11-04'
const settings: Settings = { id: 'settings', waterGoalMl: 3000, measurementSites: [], ...meta }
const habit = (changes: Partial<Habit> & Pick<Habit, 'id' | 'name'>): Habit => ({
  kind: 'check',
  polarity: 'good',
  startDate: '2026-09-01',
  archived: 0,
  order: 0,
  ...meta,
  ...changes,
})
const run = habit({ id: 'run', name: 'Corrida', frequency: { times: 3, per: 'week' } })
const beer = habit({ id: 'beer', name: 'Cerveja', polarity: 'bad', frequency: { times: 2, per: 'week' } })
const sun = habit({ id: 'sun', name: 'Sol' })
const log = (habitId: string, date: string): HabitLog => ({ id: `${habitId}:${date}`, habitId, date, value: 1, ...meta })

// Three runs in the weeks of 10-04, 10-11 and 10-25, two in the week of 10-18, one so far this week.
const runs = ['10-05', '10-07', '10-09', '10-12', '10-14', '10-16', '10-19', '10-21', '10-26', '10-28', '10-30', '11-02'].map((day) =>
  log('run', `2026-${day}`),
)

describe('the weekly habits in the analysis', () => {
  const lines = adherenceLines({ habits: [run, beer], habitLogs: runs, water: [], foodLogs: [], sessions: [], settings }, TODAY)

  it('reads a habit to do in weeks: the last four, this one so far, the streak and the strength', () => {
    expect(lines[0]).toMatch(
      /^- Hábito «Corrida» \(3 vezes por semana\): meta cumprida em 75% das últimas 4 semanas; esta semana até agora 1 dia de 3; sequência atual 1 semana; força \d+%$/,
    )
  })

  it('reads a weekly limit as weeks within it', () => {
    expect(lines[1]).toMatch(
      /^- Hábito «Cerveja» \(até 2 dias por semana\): dentro do limite em 100% das últimas 4 semanas; esta semana até agora 0 dias \(limite 2\); sequência atual 10 semanas; força \d+%$/,
    )
  })

  it('says the frequency among the goals, and the strength of a daily habit too', () => {
    const sources: Sources = {
      health: [],
      weights: [],
      foodLogs: [],
      waterLogs: [],
      habits: [run, beer, sun],
      habitLogs: [...runs, log('sun', '2026-11-03')],
      activities: [],
      sessions: [],
      journal: [],
    }
    const text = buildContext({ sources, settings, planned: null, today: TODAY, now: new Date(2026, 10, 4, 7, 40) })
    expect(text).toContain('- Hábito: Corrida (fazer, 3 vezes por semana).')
    expect(text).toContain('- Hábito: Cerveja (evitar, até 2 dias por semana).')
    expect(text).toMatch(/- Hábito «Sol»: cumprido em \d+% dos dias das últimas 2 semanas; sequência atual 1 dias; força \d+%/)
  })
})
