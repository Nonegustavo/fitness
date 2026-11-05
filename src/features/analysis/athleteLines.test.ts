import { describe, expect, it } from 'vitest'
import type { Activity, DailyHealth, Pain } from '../../db/types'
import { dayRange, dayTime, shiftDay } from '../../lib/dates'
import { athleteLines } from './athleteLines'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const TODAY = '2026-11-05'
const LIMITS = [100, 120, 140, 160, 180, 200]

/** A run every other day for 8 weeks up to today, 40 minutes in zone 3; today's a 10 km at 4:12/km. */
const days = dayRange(shiftDay(TODAY, -54), TODAY).filter((_, i) => i % 2 === 0)
const runs: Activity[] = days.map((date, i) => ({
  id: `run-${i}`,
  date,
  sport: 'running',
  startTime: dayTime(date, '07:00'),
  elapsedSec: 2520,
  timerSec: 2520,
  distanceM: 10000,
  laps: [],
  hasTrack: true,
  hrZones: { seconds: [0, 0, 0, 2400, 0, 0], limits: LIMITS },
  ...meta,
}))
const last = runs.at(-1)!
const streams = new Map([[last.id, { step: 10, distance: Array.from({ length: 253 }, (_, i) => (i * 10000) / 252) }]])

const health: DailyHealth[] = dayRange(shiftDay(TODAY, -30), TODAY).map((date) => ({
  id: date,
  sleep: { score: 82, totalSec: 8 * 3600 },
  hrv: { lastNight: 55, balancedLow: 50, balancedHigh: 60 },
  restingHr: 50,
  ...meta,
}))
const pains: Pain[] = [{ id: 'shin', name: 'canela direita', start: shiftDay(TODAY, -2), scores: { [shiftDay(TODAY, -2)]: 3 }, ...meta }]

describe('athleteLines', () => {
  const lines = athleteLines({
    sources: { activities: runs, health, pains },
    streams,
    planned: [{ date: shiftDay(TODAY, 3), title: 'Rústica de Morungava 2026 (6 a 8km)' }],
    today: TODAY,
  })
  const text = lines.join('\n')

  it('tells the load, its averages and the ratio', () => {
    expect(text).toMatch(/^- Carga de treino \(TRIMP de Edwards.*\): hoje 120, últimos 7 dias 480,/m)
    // 4 runs in the last 7 days against 3,5 a week in the last 28.
    expect(text).toContain('ACWR (7 dias contra a média semanal de 28): 1,14, equilibrada.')
    // The history is under 8 weeks long.
    expect(text).toMatch(/^- Condicionamento \(CTL\): há 4 semanas \d+, há 2 semanas \d+, hoje \d+\.$/m)
  })

  it('tells the readiness with each factor and the pains’ points', () => {
    expect(text).toMatch(/^- Prontidão para treinar hoje \(0 a 100.*\): \d+, (alta|moderada)\. Fatores: Sono nota 82 \(bom\): ajuda; HRV 55 ms, /m)
    expect(text).toContain('Dores canela direita 3/10: tira 3 pontos.')
  })

  it('tells the predictions, the VDOT and the next race’s time', () => {
    expect(text).toContain('- Previsões de prova (fórmula de Riegel, do melhor trecho longo e forte dos últimos 90 dias: 10 km em 42:00, 5/11): 5 km ~20:10 (4:02/km), 10 km ~42:00 (4:12/km)')
    expect(text).toMatch(/^- VO2max estimado \(VDOT .*\): 49,\d\. O melhor de cada mês \(6 meses\): jun — · jul — · ago — · set — · out — · nov 49,\d\.$/m)
    expect(text).toMatch(/^- Previsão para a próxima prova, Rústica de Morungava 2026 \(6 a 8km\): ~\d\d:\d\d para 7 km \(~\d\d:\d\d para 6 km, ~\d\d:\d\d para 8 km\)\.$/m)
  })

  it('says nothing without data', () => {
    expect(athleteLines({ sources: { activities: [], health: [] }, planned: null, today: TODAY })).toEqual([])
  })
})
