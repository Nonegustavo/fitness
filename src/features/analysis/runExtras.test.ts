import { describe, expect, it } from 'vitest'
import type { Activity } from '../../db/types'
import { activityText } from './contextParts'
import { workoutExtras } from './runExtras'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const

const run = (changes: Partial<Activity> = {}): Activity => ({
  id: 'r',
  sport: 'running',
  title: 'Intervalado',
  date: '2026-11-05',
  startTime: 0,
  elapsedSec: 1800,
  timerSec: 1800,
  distanceM: 5000,
  laps: [],
  hasTrack: true,
  ...meta,
  ...changes,
})

const rep = { index: 0, intensity: 'INTERVAL', durationType: 'DISTANCE', durationValue: 400, targetType: 'SPEED', targetLow: 1000 / 280, targetHigh: 1000 / 270 }
const lap = (seconds: number) => ({ startTime: 0, elapsedSec: seconds, timerSec: seconds, distanceM: 400, avgSpeed: 400 / seconds })

describe('the run line of the analysis', () => {
  it('says how the planned steps went and the weather', () => {
    const activity = run({
      workout: { steps: [rep, { index: 1, durationType: 'REPEAT_UNTIL_STEPS_CMPLT', durationValue: 0, targetValue: 2 }] },
      laps: [lap(110), lap(116)],
      weather: { tempC: 31, feelsC: 35, humidity: 55, windKmh: 6, code: 1 },
    })
    expect(workoutExtras(activity)).toEqual([
      'execução do treino planejado: 1 de 2 tiros no alvo (1 mais lento)',
      'clima: poucas nuvens, 31 °C, sensação 35 °C, umidade 55%, vento 6 km/h',
    ])
    expect(activityText(activity)).toContain('execução do treino planejado: 1 de 2 tiros no alvo')
  })

  it('warns when the laps are not the steps, so they are not read as such', () => {
    // The watch splitting every km instead.
    const km = { ...lap(300), distanceM: 1000 }
    const activity = run({ workout: { steps: [rep, { index: 1, durationType: 'REPEAT_UNTIL_STEPS_CMPLT', durationValue: 0, targetValue: 4 }] }, laps: [km, km] })
    expect(workoutExtras(activity)).toEqual(['execução do treino planejado: as voltas não batem com as etapas do treino (2 voltas para 4 etapas)'])
    expect(workoutExtras(run())).toEqual([])
  })
})
