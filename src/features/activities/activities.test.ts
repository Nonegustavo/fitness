import { describe, expect, it } from 'vitest'
import type { Activity, ActivityStream, WorkoutSession } from '../../db/types'
import { coachMessage, formatSpeed, matchActivity, matchSession, setPeakHeartRates } from './activities'

const T0 = Date.UTC(2026, 10, 3, 21, 0, 0)
const MIN = 60_000
const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const

const activity = (changes: Partial<Activity> = {}): Activity => ({
  id: 'gym',
  sport: 'training',
  subSport: 'strengthTraining',
  date: '2026-11-03',
  startTime: T0,
  elapsedSec: 3600,
  timerSec: 3600,
  laps: [],
  hasTrack: false,
  ...meta,
  ...changes,
})

const workout = (changes: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: 'w',
  name: 'Treino A',
  date: '2026-11-03',
  startedAt: T0 + 2 * MIN,
  endedAt: T0 + 58 * MIN,
  exercises: [],
  ...meta,
  ...changes,
})

describe('matching a workout with the watch', () => {
  const run = activity({ id: 'run', sport: 'running', subSport: undefined, startTime: T0 - 12 * 60 * MIN })

  it('pairs the workout with the activity recorded at the same time', () => {
    expect(matchActivity(workout(), [run, activity()])?.id).toBe('gym')
    expect(matchSession(activity(), [workout()])?.id).toBe('w')
  })

  it('needs them to share at least half of the shorter one', () => {
    const later = activity({ startTime: T0 + 50 * MIN, elapsedSec: 100 * 60 })
    expect(matchActivity(workout(), [later])).toBeUndefined()
  })

  it('ignores a workout still in progress', () => {
    expect(matchActivity(workout({ endedAt: undefined }), [activity()])).toBeUndefined()
  })
})

describe('setPeakHeartRates', () => {
  const doneAt = T0 + 600_000
  const hr = Array.from({ length: 3601 }, () => 100)
  hr[520] = 160 // early in the set, as the watch saw it
  hr[610] = 150 // 10 s after the set was checked
  const stream: ActivityStream = { id: 'gym', step: 1, hr, ...meta }
  const session = workout({
    exercises: [
      {
        key: 'e1',
        exerciseId: 'supino',
        restSec: 90,
        sets: [
          { key: 's1', kind: 'normal', done: true, completedAt: doneAt, reps: 10, weightKg: 40 },
          { key: 's2', kind: 'normal', done: true, reps: 10, weightKg: 40 },
        ],
      },
    ],
  })

  it('takes the peak from 30 s before the check to 15 s after', () => {
    expect(setPeakHeartRates(session, activity(), stream)).toEqual(new Map([['s1', 150]]))
  })

  it('starts at the watch set that ends near the check', () => {
    const watch = activity({ sets: [{ startTime: T0 + 500_000, durationSec: 90 }] })
    expect(setPeakHeartRates(session, watch, stream).get('s1')).toBe(160)
  })
})

describe('formatSpeed', () => {
  it('shows pace on foot, per 100 m swimming and km/h otherwise', () => {
    expect(formatSpeed(1000 / 300, 'pace')).toBe('5:00 /km')
    expect(formatSpeed(1, 'swim')).toBe('1:40 /100 m')
    expect(formatSpeed(10, 'speed')).toBe('36,0 km/h')
    expect(formatSpeed(0.1, 'pace')).toBe('—')
  })
})

describe('coachMessage', () => {
  const run = { sport: 'running', title: 'Corrida 7 Km', date: '2026-11-05' }

  it('puts the workout and its day, the comment, the effort and the pain in a message', () => {
    const message = coachMessage({ ...run, notes: 'Tiros no ritmo.\nO último mais pesado.', effort: 7, discomfort: ['knee', 'ankle'] })
    expect(message).toBe('Corrida 7 Km (quinta, 5/11)\nTiros no ritmo.\nO último mais pesado.\nEsforço (PSE): 7/10\nDesconforto: joelho, tornozelo')
  })

  it('leaves out what was not filled, and names a workout without a title by its sport', () => {
    expect(coachMessage({ ...run, notes: '  ', effort: 5 })).toBe('Corrida 7 Km (quinta, 5/11)\nEsforço (PSE): 5/10')
    expect(coachMessage({ sport: 'running', date: '2026-11-05', notes: 'Leve.' })).toBe('Corrida (quinta, 5/11)\nLeve.')
  })
})
