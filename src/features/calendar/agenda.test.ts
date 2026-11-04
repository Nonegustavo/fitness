import { describe, expect, it } from 'vitest'
import type { Activity, WorkoutPlan, WorkoutSession, WorkoutTemplate } from '../../db/types'
import { dayTime } from '../../lib/dates'
import { buildAgenda, eventKind, suggestTemplate, type AgendaSources } from './agenda'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const TODAY = '2026-11-05'

const template = (id: string, order: number, archived?: 1): WorkoutTemplate => ({
  id,
  name: id.toUpperCase(),
  exercises: [],
  order,
  ...(archived && { archived }),
  ...meta,
})
const templates = [template('legs', 0), template('pull', 1), template('push', 2), template('old', 3, 1)]

const plan = (id: string, date: string, templateId: string, time?: string): WorkoutPlan => ({
  id,
  date,
  templateId,
  ...(time && { time }),
  ...meta,
})

const session = (id: string, date: string, templateId: string | undefined, ended = true): WorkoutSession => ({
  id,
  date,
  templateId,
  name: templateId ? templateId.toUpperCase() : 'Treino livre',
  startedAt: dayTime(date, '18:00'),
  ...(ended && { endedAt: dayTime(date, '19:00') }),
  exercises: [],
  ...meta,
})

const activity = (id: string, date: string, sport: string, subSport?: string): Activity => ({
  id,
  date,
  sport,
  subSport,
  startTime: dayTime(date, '07:00'),
  elapsedSec: 3000,
  timerSec: 2900,
  laps: [],
  hasTrack: false,
  ...meta,
})

const sources = (changes: Partial<AgendaSources>): AgendaSources => ({
  plans: [],
  events: null,
  sessions: [],
  activities: [],
  templates,
  ...changes,
})

describe('eventKind', () => {
  it('reads runs, rides, swims, strength and rest days from the names', () => {
    expect(eventKind({ title: 'Rodagem 8 km' })).toBe('run')
    expect(eventKind({ title: 'Intervalado', description: '10x400 m' })).toBe('run')
    expect(eventKind({ title: 'Pedal leve' })).toBe('ride')
    expect(eventKind({ title: 'Natação técnica' })).toBe('swim')
    expect(eventKind({ title: 'Treino de força' })).toBe('gym')
    expect(eventKind({ title: 'Descanso' })).toBe('rest')
    expect(eventKind({ title: 'Caminhada' })).toBe('walk')
  })
})

describe('buildAgenda', () => {
  it('marks a scheduled template done by a workout of it that day, and the others planned or missed', () => {
    const items = buildAgenda(
      '2026-11-03',
      '2026-11-07',
      TODAY,
      sources({
        plans: [
          plan('p1', '2026-11-03', 'legs'),
          plan('p2', '2026-11-04', 'pull'),
          plan('p3', '2026-11-05', 'push', '18:30'),
          plan('p4', '2026-11-07', 'legs'),
        ],
        sessions: [session('s1', '2026-11-03', 'legs'), session('s2', '2026-11-04', 'push')],
      }),
    )
    expect(items.map((item) => [item.date, item.title, item.status])).toEqual([
      ['2026-11-03', 'LEGS', 'done'],
      // Another template was done that day: the plan was missed and the workout is listed apart.
      ['2026-11-04', 'PUSH', 'done'],
      ['2026-11-04', 'PULL', 'missed'],
      ['2026-11-05', 'PUSH', 'planned'],
      ['2026-11-07', 'LEGS', 'planned'],
    ])
    expect(items.find((item) => item.plan?.id === 'p3')?.time).toBe(dayTime('2026-11-05', '18:30'))
  })

  it('shows a workout in progress and counts a plan done on the watch only', () => {
    const items = buildAgenda(
      '2026-11-04',
      TODAY,
      TODAY,
      sources({
        plans: [plan('p1', '2026-11-04', 'pull'), plan('p2', TODAY, 'push')],
        sessions: [session('s1', TODAY, 'push', false)],
        activities: [activity('a1', '2026-11-04', 'training', 'strengthTraining')],
      }),
    )
    expect(items.map((item) => [item.title, item.status, item.activity?.id ?? item.session?.id])).toEqual([
      ['PULL', 'done', 'a1'],
      ['PUSH', 'active', 's1'],
    ])
  })

  it('matches the Garmin workouts with the activities of the same kind and keeps the rest', () => {
    const items = buildAgenda(
      '2026-11-04',
      '2026-11-06',
      TODAY,
      sources({
        events: [
          { date: '2026-11-04', title: 'Rodagem 8 km' },
          { date: TODAY, title: 'Intervalado' },
          { date: '2026-11-06', title: 'Descanso' },
        ],
        sessions: [session('s1', TODAY, 'legs')],
        activities: [
          activity('run', '2026-11-04', 'running'),
          { ...activity('bike', '2026-11-04', 'cycling'), startTime: dayTime('2026-11-04', '17:00') },
          // The watch's record of the gym workout of the app: not listed twice.
          activity('gym', TODAY, 'training', 'strengthTraining'),
        ],
      }),
    )
    expect(items.map((item) => [item.date, item.kind, item.status, item.activity?.id])).toEqual([
      ['2026-11-04', 'run', 'done', 'run'],
      ['2026-11-04', 'ride', 'done', 'bike'],
      [TODAY, 'gym', 'done', undefined],
      [TODAY, 'run', 'planned', undefined],
      ['2026-11-06', 'rest', 'planned', undefined],
    ])
  })
})

describe('suggestTemplate', () => {
  it('follows the rotation after the last workout done or scheduled before that day', () => {
    const history = { templates, sessions: [session('s1', '2026-11-03', 'legs')], plans: [plan('p1', '2026-11-06', 'pull')] }
    expect(suggestTemplate(TODAY, TODAY, history)?.id).toBe('pull')
    expect(suggestTemplate('2026-11-08', TODAY, history)?.id).toBe('push')
    // After the last of the rotation it starts over; archived templates are skipped.
    expect(suggestTemplate('2026-11-08', TODAY, { ...history, plans: [plan('p2', '2026-11-06', 'push')] })?.id).toBe('legs')
  })

  it('ignores past plans that were not done and starts the rotation without history', () => {
    const plans = [plan('p1', '2026-11-04', 'pull')]
    expect(suggestTemplate(TODAY, TODAY, { templates, sessions: [session('s1', '2026-11-01', 'legs')], plans })?.id).toBe('pull')
    expect(suggestTemplate(TODAY, TODAY, { templates, sessions: [], plans: [] })?.id).toBe('legs')
  })
})
