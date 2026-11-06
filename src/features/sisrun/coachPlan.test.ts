import { describe, expect, it } from 'vitest'
import type { Activity } from '../../db/types'
import { dayTime } from '../../lib/dates'
import { buildAgenda, fromCoach, plannedKm, weekSummary, type AgendaSources } from '../calendar/agenda'
import { coachSummary, structureLines, structureText } from '../calendar/eventText'
import type { PlannedEvent } from '../garmin/calendar'
import { mergePlan, planWorkouts, type CoachPlan, type CoachWorkout } from './coachPlan'

const TODAY = '2026-11-05'

const workout = (date: string, changes: Partial<CoachWorkout> = {}): CoachWorkout => ({
  date,
  weekStart: '2026-11-02',
  status: 'Proposto',
  modality: 'Corrida',
  type: 'Intervalado ativo',
  route: '',
  structure: [],
  ...changes,
})

describe('mergePlan', () => {
  const kept: CoachPlan = {
    fetchedAt: 1,
    weeks: {
      '2026-08-17': [workout('2026-08-18')],
      '2026-10-26': [workout('2026-10-28')],
      '2026-11-02': [workout('2026-11-06', { structure: ['Aquecer por 15 min'] })],
    },
    error: { message: 'O SisRUN não respondeu.', at: 2 },
  }

  it('replaces the weeks that came, keeps the others for 70 days, and clears the error', () => {
    const next = mergePlan(kept, [{ start: '2026-11-09', workouts: [workout('2026-11-10')], detailsMissing: false }], 10, TODAY)
    expect(next.fetchedAt).toBe(10)
    expect(next.error).toBeUndefined()
    expect(Object.keys(next.weeks).sort()).toEqual(['2026-10-26', '2026-11-02', '2026-11-09'])
  })

  it("doesn't let a week without its details overwrite the one read before", () => {
    const bare = [workout('2026-11-06')]
    expect(mergePlan(kept, [{ start: '2026-11-02', workouts: bare, detailsMissing: true }], 10, TODAY).weeks['2026-11-02']).toBe(
      kept.weeks['2026-11-02'],
    )
    expect(mergePlan(kept, [{ start: '2026-11-02', workouts: bare, detailsMissing: false }], 10, TODAY).weeks['2026-11-02']).toBe(bare)
    // A new week without details is still better than nothing.
    expect(mergePlan(kept, [{ start: '2026-11-09', workouts: bare, detailsMissing: true }], 10, TODAY).weeks['2026-11-09']).toBe(bare)
  })

  it('lists the workouts in date order', () => {
    expect(planWorkouts(kept).map((item) => item.date)).toEqual(['2026-08-18', '2026-10-28', '2026-11-06'])
    expect(planWorkouts(undefined)).toEqual([])
  })
})

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const

const event = (date: string, title: string): PlannedEvent => ({ date, title })

const sources = (changes: Partial<AgendaSources>): AgendaSources => ({
  plans: [],
  events: null,
  sessions: [],
  activities: [],
  templates: [],
  ...changes,
})

describe('the coach plan in the agenda', () => {
  it('tells the SisRUN workouts of the Garmin calendar by the day in their names', () => {
    expect(fromCoach({ title: '06/11 Sex - Corrida Intervalado ativo 4,48 - 4,97 Km' })).toBe(true)
    expect(fromCoach({ title: '08/11 Dom - Corrida 7 Km' })).toBe(true)
    expect(fromCoach({ title: 'Rústica de Morungava 2026 (6 a 8km)' })).toBe(false)
    expect(fromCoach({ title: 'Rodagem 8 km' })).toBe(false)
  })

  it("gives each SisRUN workout its day's prescription, by type when the day has two", () => {
    const items = buildAgenda(
      TODAY,
      '2026-11-08',
      TODAY,
      sources({
        events: [
          event('2026-11-06', '06/11 Sex - Corrida Intervalado ativo 4,48 - 4,97 Km'),
          event('2026-11-08', '08/11 Dom - Corrida Fartlek 7 Km'),
          event('2026-11-08', '08/11 Dom - Corrida Regenerativo 3 Km'),
          event('2026-11-08', 'Rústica de Morungava 2026 (6 a 8km)'),
        ],
        coach: [
          workout('2026-11-06', { plannedKm: 5.47, structure: ['Aquecer por 15 min'] }),
          workout('2026-11-07', { status: 'Feito Avulso', modality: 'Caminhada', type: '' }),
          workout('2026-11-08', { type: 'Regenerativo', plannedKm: 3 }),
          workout('2026-11-08', { type: 'Fartlek', plannedKm: 7.2 }),
        ],
      }),
    )
    const coachOf = (title: string) => items.find((item) => item.title.includes(title))?.coach
    expect(coachOf('Intervalado ativo')?.plannedKm).toBe(5.47)
    expect(coachOf('Fartlek')?.type).toBe('Fartlek')
    expect(coachOf('Regenerativo')?.type).toBe('Regenerativo')
    // The race the user put in the calendar isn't SisRUN's, and the imported walk isn't a prescription.
    expect(coachOf('Rústica')).toBeUndefined()
    expect(items).toHaveLength(4)
  })

  it('plans the km the coach prescribed, else the ones in the name', () => {
    const items = buildAgenda(
      TODAY,
      '2026-11-08',
      TODAY,
      sources({
        events: [event('2026-11-06', '06/11 Sex - Corrida Intervalado ativo 4,48 - 4,97 Km'), event('2026-11-08', '08/11 Dom - Corrida 7 Km')],
        coach: [workout('2026-11-06', { plannedKm: 5.47 })],
      }),
    )
    expect(items.map(plannedKm)).toEqual([5.47, 7])
    const done: Activity = {
      id: 'a',
      date: '2026-11-03',
      sport: 'running',
      startTime: dayTime('2026-11-03', '07:00'),
      elapsedSec: 2000,
      timerSec: 1900,
      distanceM: 6020,
      laps: [],
      hasTrack: false,
      ...meta,
    }
    const week = buildAgenda('2026-11-01', '2026-11-07', TODAY, sources({ events: [event('2026-11-06', '06/11 Sex - Corrida 4 Km')], activities: [done], coach: [workout('2026-11-06', { plannedKm: 4.6 })] }))
    expect(weekSummary(week).plannedRunKm).toBe(10.62)
  })
})

describe('the session as text', () => {
  const structure = [
    'Aquecer por 10 min (06:00 a 06:40 min/km)',
    'Repetir 3x',
    '- Correr por 1,2 km (05:22 a 05:29 min/km)',
    '- Trotar por 1:45 min',
    'Desaquecer por 5 min',
  ]

  it('nests the repeat steps and reads what each step is', () => {
    expect(structureLines(structure)).toEqual([
      { text: 'Aquecer por 10 min (06:00 a 06:40 min/km)', depth: 0, kind: 'warmup' },
      { text: 'Repetir 3x', depth: 0, kind: 'repeat' },
      { text: 'Correr por 1,2 km (05:22 a 05:29 min/km)', depth: 1, kind: 'step' },
      { text: 'Trotar por 1:45 min', depth: 1, kind: 'recovery' },
      { text: 'Desaquecer por 5 min', depth: 0, kind: 'cooldown' },
    ])
  })

  it('writes it in a line, the repeat with its steps', () => {
    expect(structureText(structure)).toBe(
      'Aquecer por 10 min (06:00 a 06:40 min/km) · Repetir 3x: Correr por 1,2 km (05:22 a 05:29 min/km) + Trotar por 1:45 min · Desaquecer por 5 min',
    )
  })

  it('sums up the prescription for the analysis, and only the steps for the list', () => {
    const coach = workout(TODAY, {
      type: 'Intervalado',
      plannedKm: 5.93,
      plannedKmEstimated: true,
      intensity: 'Forte',
      hrMin: 150,
      hrMax: 172,
      structure: structure.slice(1, 3),
      note: 'Sem forçar a subida.',
    })
    expect(coachSummary(coach)).toBe(
      'Intervalado · 5,9 km (estimado) · intensidade forte · FC 150–172 · Repetir 3x: Correr por 1,2 km (05:22 a 05:29 min/km) · observação do treinador: Sem forçar a subida.',
    )
    expect(coachSummary(coach, { short: true })).toBe('Repetir 3x: Correr por 1,2 km (05:22 a 05:29 min/km)')
    expect(coachSummary(workout(TODAY, { type: 'Regenerativo', intensity: 'Leve' }), { short: true })).toBe('Regenerativo · Leve')
  })
})
