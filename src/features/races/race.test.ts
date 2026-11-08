import { describe, expect, it } from 'vitest'
import type { Activity, Race } from '../../db/types'
import { dayTime } from '../../lib/dates'
import { eventKey } from '../calendar/agenda'
import {
  distanceInput,
  distanceText,
  garminRaces,
  nextRaceView,
  parseClock,
  parseDistance,
  raceDistanceOf,
  raceDone,
  raceFromEvent,
  raceResult,
  upcomingRaces,
} from './race'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const race = (id: string, changes: Partial<Race> = {}): Race => ({ id, name: `Prova ${id}`, date: '2026-11-15', ...meta, ...changes })
const run = (id: string, date: string, km: number, seconds: number): Activity => ({
  id,
  date,
  sport: 'running',
  startTime: dayTime(date, '09:00'),
  elapsedSec: seconds,
  timerSec: seconds,
  distanceM: km * 1000,
  laps: [],
  hasTrack: false,
  ...meta,
})

describe('a race typed in', () => {
  it('reads the distance in km, a range, or the name of a classic', () => {
    expect(parseDistance('10')).toEqual({ distanceM: 10000 })
    expect(parseDistance('21,1')).toEqual({ distanceM: 21100 })
    expect(parseDistance('6 a 8')).toEqual({ rangeM: [6000, 8000] })
    expect(parseDistance('10k')).toEqual({ distanceM: 10000 })
    expect(parseDistance('Meia maratona')).toEqual({ distanceM: 21097.5 })
    expect(parseDistance('  ')).toEqual({})
    expect(parseDistance('longe')).toBeUndefined()
  })

  it('shows the distance as typed, and reads it back the same', () => {
    expect(distanceText(raceDistanceOf({ rangeM: [6000, 8000] }))).toBe('6 a 8 km')
    expect(distanceText(raceDistanceOf({ distanceM: 21097.5 }))).toBe('21,1 km')
    expect(distanceInput({ distanceM: 10000 })).toBe('10')
    expect(distanceInput({ rangeM: [6000, 8000] })).toBe('6 a 8')
    expect(distanceInput({})).toBe('')
  })

  it('reads times as min:s, h:min:s or whole minutes', () => {
    expect(parseClock('38:25')).toBe(2305)
    expect(parseClock('1:45:30')).toBe(6330)
    expect(parseClock('50')).toBe(3000)
    expect(parseClock('38:75')).toBeUndefined()
    expect(parseClock('0:00')).toBeUndefined()
    expect(parseClock('rápido')).toBeUndefined()
  })
})

describe('the races of the app and of the Garmin calendar', () => {
  const morungava = { date: '2026-11-08', title: 'Rústica de Morungava 2026 (6 a 8km)', time: dayTime('2026-11-08', '08:00') }
  const coach = { date: '2026-11-08', title: '08/11 Dom - Corrida 7 km' }
  const silvestre = { date: '2026-12-31', title: 'São Silvestre 15K' }

  it('brings a Garmin race in with its distance and the key that ties them', () => {
    expect(raceFromEvent(morungava, '08:00')).toEqual({
      name: 'Rústica de Morungava 2026 (6 a 8km)',
      date: '2026-11-08',
      time: '08:00',
      rangeM: [6000, 8000],
      eventKey: eventKey(morungava),
    })
  })

  it("leaves out of the Garmin's the ones in the list (and the coach's workouts)", () => {
    const brought = race('a', { date: '2026-11-08', eventKey: eventKey(morungava) })
    const typed = race('b', { date: '2026-12-31', name: 'sao silvestre 15k' })
    expect(garminRaces([morungava, coach, silvestre], [])).toEqual([morungava, silvestre])
    expect(garminRaces([morungava, coach, silvestre], [brought, typed])).toEqual([])
  })

  it('puts the next race first, from either side', () => {
    const races = [race('later', { date: '2026-12-20' }), race('past', { date: '2026-11-01' })]
    expect(upcomingRaces(races, [silvestre, morungava], '2026-11-08').map((view) => view.name)).toEqual([
      'Rústica de Morungava 2026 (6 a 8km)',
      'Prova later',
      'São Silvestre 15K',
    ])
    expect(nextRaceView(races, null, '2026-11-09')?.race?.id).toBe('later')
    expect(nextRaceView([], null, '2026-11-09')).toBeUndefined()
    // Today's race, once run, is behind: the next one comes up.
    const today = [race('today', { date: '2026-11-08' }), ...races]
    expect(nextRaceView(today, null, '2026-11-08', [])?.race?.id).toBe('today')
    expect(nextRaceView(today, null, '2026-11-08', [run('ran', '2026-11-08', 7, 2500)])?.race?.id).toBe('later')
  })

  it('takes the time and pace of its run, against the goal', () => {
    const runs = [run('warmup', '2026-11-08', 1.5, 600), run('race', '2026-11-08', 6.24, 2305)]
    const result = raceResult(race('r', { date: '2026-11-08', goalSec: 2400 }), runs)
    expect(result).toMatchObject({ seconds: 2305, official: false, meters: 6240, vsGoal: -95 })
    expect(result.run?.id).toBe('race')
    expect(Math.round(result.pace!)).toBe(369)
  })

  it('counts the official time, by the race distance', () => {
    const runs = [run('race', '2026-11-15', 10.12, 3000)]
    const result = raceResult(race('r', { distanceM: 10000, officialSec: 2990, goalSec: 3000 }), runs)
    expect(result).toMatchObject({ seconds: 2990, official: true, pace: 299, vsGoal: -10 })
  })

  it('is behind once its day passed or its run came in', () => {
    expect(raceDone(race('r'), [], '2026-11-16')).toBe(true)
    expect(raceDone(race('r'), [], '2026-11-15')).toBe(false)
    expect(raceDone(race('r'), [run('x', '2026-11-15', 10, 3000)], '2026-11-15')).toBe(true)
  })
})
