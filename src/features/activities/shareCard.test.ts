import { describe, expect, it } from 'vitest'
import type { Activity, Exercise, WorkoutSession } from '../../db/types'
import { activityCard, bestSetText, gymCard, projectTrack } from './shareCard'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const

const run: Activity = {
  id: 'r',
  sport: 'running',
  title: 'Corrida 10 Km',
  date: '2026-11-05',
  startTime: new Date(2026, 10, 5, 6, 30).getTime(),
  elapsedSec: 3300,
  timerSec: 3250,
  distanceM: 10020,
  avgSpeed: 10020 / 3250,
  avgHr: 151,
  ascentM: 84,
  effort: 6,
  laps: [],
  hasTrack: true,
  ...meta,
}

describe('the share card of a run', () => {
  it('has the numbers, the effort and the route', () => {
    const card = activityCard(run, { track: [[-29, -51], [-29.01, -51.01]] })
    expect(card).toMatchObject({ kind: 'activity', label: 'CORRIDA', title: 'Corrida 10 Km', date: 'Quinta-feira, 5 de novembro de 2026 · 06:30' })
    expect(card.stats).toEqual([
      { label: 'Distância', value: '10,02 km' },
      { label: 'Tempo', value: '54:10' },
      { label: 'Ritmo', value: '5:24 /km' },
      { label: 'FC média', value: '151 bpm' },
      { label: 'Subida', value: '84 m' },
      { label: 'Esforço (PSE)', value: '6/10' },
    ])
    expect(card.headline).toBeUndefined()
  })

  it('shows the distance big when there is no route (a treadmill), and not again below', () => {
    const card = activityCard({ ...run, subSport: 'treadmill', hasTrack: false, ascentM: undefined, effort: undefined }, null)
    expect(card.track).toBeUndefined()
    expect(card.headline).toEqual({ label: 'Distância', value: '10,02 km' })
    expect(card.stats.map((stat) => stat.label)).toEqual(['Tempo', 'Ritmo', 'FC média'])
    expect(card.label).toBe('ESTEIRA')
  })

  it('fits the route in its box without stretching it, centered', () => {
    // 0.01° north and 0.01° east at the equator: a square.
    const points = projectTrack([[0, 0], [0.01, 0.01]], { x: 100, y: 50, width: 400, height: 200 })
    expect(points[0][0]).toBeCloseTo(200)
    expect(points[0][1]).toBeCloseTo(250)
    expect(points[1][0]).toBeCloseTo(400)
    expect(points[1][1]).toBeCloseTo(50)
  })
})

describe('the share card of a gym workout', () => {
  const exercises = new Map<string, Exercise>([
    ['bench', { id: 'bench', name: 'Supino reto', muscle: 'chest', equipment: 'barbell', type: 'weight_reps', ...meta }],
    ['row', { id: 'row', name: 'Remada', muscle: 'back', equipment: 'cable', type: 'weight_reps', ...meta }],
    ['plank', { id: 'plank', name: 'Prancha', muscle: 'abs', equipment: 'bodyweight', type: 'time', ...meta }],
    ['curl', { id: 'curl', name: 'Rosca', muscle: 'biceps', equipment: 'dumbbell', type: 'weight_reps', ...meta }],
  ])
  const set = (key: string, weightKg?: number, reps?: number, durationSec?: number) => ({ key, kind: 'normal' as const, done: true, weightKg, reps, durationSec })
  const session: WorkoutSession = {
    id: 's',
    name: 'Treino A',
    date: '2026-11-04',
    startedAt: new Date(2026, 10, 4, 18, 0).getTime(),
    endedAt: new Date(2026, 10, 4, 19, 5).getTime(),
    exercises: [
      { key: 'e1', exerciseId: 'bench', restSec: 90, sets: [set('1', 60, 10), set('2', 70, 6), { ...set('w', 40, 10), kind: 'warmup' }] },
      { key: 'e2', exerciseId: 'row', restSec: 90, sets: [set('1', 80, 12), set('2', 80, 12)] },
      { key: 'e3', exerciseId: 'plank', restSec: 60, sets: [set('1', undefined, undefined, 60), set('2', undefined, undefined, 75)] },
      { key: 'e4', exerciseId: 'curl', restSec: 60, sets: [set('1', 12, 10)] },
    ],
    ...meta,
  }

  it('has the time, volume and sets, the records first and then the most volume', () => {
    const card = gymCard(session, exercises, new Set(['curl']))
    expect(card.stats).toEqual([
      { label: 'Duração', value: '1h05' },
      { label: 'Volume', value: '3.060 kg' },
      { label: 'Séries', value: '7' },
    ])
    expect(card.records).toBe(1)
    expect(card.top).toEqual([
      { name: 'Rosca', best: '12 kg × 10', record: true },
      { name: 'Remada', best: '80 kg × 12', record: false },
      { name: 'Supino reto', best: '70 kg × 6', record: false },
    ])
  })

  it('reads the best set of a hold or of reps without load', () => {
    expect(bestSetText([set('1', undefined, undefined, 60), set('2', undefined, undefined, 75)])).toBe('1:15')
    expect(bestSetText([set('1', undefined, 12), set('2', undefined, 15)])).toBe('15 repetições')
  })
})
