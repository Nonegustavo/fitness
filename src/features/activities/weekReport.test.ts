import { describe, expect, it } from 'vitest'
import type { Activity, ActivityLap, Pain } from '../../db/types'
import { dayTime } from '../../lib/dates'
import type { PlannedEvent } from '../garmin/calendar'
import { weekReport } from './weekReport'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const TODAY = '2026-11-05'
const LAST_WEEK = '2026-10-25'
const THIS_WEEK = '2026-11-01'

const lap = (timerSec: number, distanceM: number): ActivityLap => ({ startTime: 0, elapsedSec: timerSec, timerSec, distanceM, avgSpeed: distanceM / timerSec })

const run = (id: string, date: string, changes: Partial<Activity> = {}): Activity => ({
  id,
  date,
  sport: 'running',
  startTime: dayTime(date, '06:30'),
  elapsedSec: 2500,
  timerSec: 2490,
  distanceM: 7020,
  avgSpeed: 7020 / 2490,
  avgHr: 148,
  laps: [],
  hasTrack: true,
  ...meta,
  ...changes,
})

/** Two 800 m reps at 4:30–4:40 /km, the second too slow. */
const intervals = run('r1', '2026-10-27', {
  title: 'Corrida Intervalado',
  distanceM: 5000,
  timerSec: 1700,
  avgSpeed: 5000 / 1700,
  avgHr: 152,
  effort: 7,
  discomfort: ['knee'],
  notes: 'Tiros bons.\nO último pesou.',
  weather: { tempC: 24.2, feelsC: 26, humidity: 70, windKmh: 9, code: 0 },
  workout: {
    steps: [
      { index: 0, intensity: 'INTERVAL', durationType: 'DISTANCE', durationValue: 800, targetType: 'SPEED', targetLow: 1000 / 280, targetHigh: 1000 / 270 },
      { index: 1, intensity: 'RECOVERY', durationType: 'TIME', durationValue: 90 },
      { index: 2, durationType: 'REPEAT_UNTIL_STEPS_CMPLT', durationValue: 0, targetValue: 2 },
    ],
  },
  laps: [lap(220, 800), lap(90, 200), lap(232, 800), lap(90, 200)],
})

const event = (date: string, title: string): PlannedEvent => ({ date, title })

const pains: Pain[] = [
  { id: 'p1', name: 'canela direita', start: '2026-10-26', end: '2026-10-30', scores: { '2026-10-26': 3, '2026-10-29': 5 }, ...meta },
  { id: 'p2', name: 'lombar', start: '2026-10-01', scores: { '2026-10-01': 2 }, ...meta },
  { id: 'p3', name: 'ombro', start: '2026-09-01', end: '2026-09-10', scores: { '2026-09-01': 6 }, ...meta },
]

const input = {
  today: TODAY,
  activities: [intervals, run('r2', '2026-10-29', { title: 'Corrida 7 Km' }), run('r3', '2026-11-03')],
  events: [
    event('2026-10-27', '27/10 Ter - Corrida Intervalado 5 Km'),
    event('2026-10-29', '29/10 Qui - Corrida 7 Km'),
    event('2026-10-31', '31/10 Sáb - Corrida 10 Km'),
    event('2026-11-06', '06/11 Sex - Corrida 8 Km'),
  ],
  eventTimes: [],
  pains,
}

describe('weekReport', () => {
  it('tells the coach each run of the week, the plan missed and the diary pains', () => {
    expect(weekReport({ ...input, week: LAST_WEEK })).toBe(
      [
        'Relatório da semana: 25/10 a 31/10',
        '',
        // The plan: 5 and 7 km for the runs done, 10 for the one missed.
        'Corrida: 12 km de 22 km previstos · 2 corridas · 1h10',
        '',
        'Terça, 27/10 · Corrida Intervalado',
        '5 km em 28:20 · ritmo 5:40/km · FC média 152',
        '1 de 2 tiros no alvo (1 mais lento)',
        'PSE 7/10 · desconforto: joelho',
        'Comentário: Tiros bons. / O último pesou.',
        'Clima: céu limpo, 24 °C, sensação 26 °C, umidade 70%, vento 9 km/h',
        '',
        'Quinta, 29/10 · Corrida 7 Km',
        '7,02 km em 41:30 · ritmo 5:55/km · FC média 148',
        '',
        'Planejados e não feitos:',
        '- Sábado, 31/10: Corrida 10 Km',
        '',
        'Dores do diário (de 1 a 10):',
        '- lombar: 2/10',
        '- canela direita: 3/10 em 26/10, 5/10 em 29/10, até 30/10',
      ].join('\n'),
    )
  })

  it('this week goes up to today, with the runs still ahead', () => {
    const text = weekReport({ ...input, week: THIS_WEEK })
    // 7 km run and the 8 km still ahead.
    expect(text).toMatch(/^Relatório da semana: 1\/11 a 7\/11 \(até hoje\)\n\nCorrida: 7 km de 15 km previstos · 1 corrida · 42 min/)
    expect(text).toContain('Terça, 3/11 · Corrida\n7,02 km em 41:30')
    expect(text).toContain('Ainda por fazer nesta semana:\n- Sexta, 6/11: Corrida 8 Km')
    expect(text).toContain('- lombar: 2/10')
    expect(text).not.toContain('canela')
  })

  it('leaves the plan out when the calendar has nothing for the week', () => {
    const text = weekReport({ ...input, events: null, week: LAST_WEEK })
    expect(text).toContain('Corrida: 12 km · 2 corridas · 1h10')
    expect(text).not.toContain('Planejados')
  })
})
