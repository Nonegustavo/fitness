import { describe, expect, it } from 'vitest'
import type { Activity, DailyHealth, Habit, HabitLog, JournalEntry, Settings } from '../../db/types'
import { dayRange, shiftDay } from '../../lib/dates'
import type { Sources } from '../insights/metrics'
import { buildContext, hasRecentData } from './context'
import { parseInsight } from './daily'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const TODAY = '2026-11-03'
const days = dayRange(shiftDay(TODAY, -69), TODAY)

const settings: Settings = {
  id: 'settings',
  waterGoalMl: 3000,
  measurementSites: [],
  nutrition: { normal: { kcal: 2200, protein: 160, carbs: 220, fat: 70 } },
  ...meta,
}
const alcohol: Habit = { id: 'alcool', name: 'Álcool', kind: 'check', polarity: 'bad', startDate: days[0], archived: 0, order: 0, ...meta }
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

/** 70 days: a drink every third day, and HRV 10 ms lower the night after. Sleep got better lately. */
function world(): Sources {
  const habitLogs: HabitLog[] = days
    .filter((_, i) => i % 3 === 0)
    .map((date) => ({ id: `alcool:${date}`, habitId: 'alcool', date, value: 1, ...meta }))
  const drank = new Set(habitLogs.map((log) => log.date))
  const health: DailyHealth[] = days.map((date, i) => ({
    id: date,
    sleep: { totalSec: (i < 40 ? 6.5 : 7.5) * 3600, score: i < 40 ? 72 : 81 },
    hrv: { lastNight: (drank.has(shiftDay(date, -1)) ? 48 : 58) + (i % 4) },
    restingHr: 51,
    ...meta,
  }))
  const journal: JournalEntry[] = [{ id: TODAY, text: 'Reunião longa, jantei tarde.', mood: 3, ...meta }]
  return { ...empty, habits: [alcohol], habitLogs, health, journal }
}

const build = (sources: Sources) =>
  buildContext({
    sources,
    settings,
    planned: [{ date: shiftDay(TODAY, 1), title: 'Rodagem 8 km', description: 'Ritmo leve' }],
    gymPlans: [{ date: shiftDay(TODAY, 2), name: 'PULL DAY', time: '18:30' }],
    previous: { id: shiftDay(TODAY, -1), headline: 'Sono melhorando', sections: [], createdAt: 1, model: 'x', ...meta },
    today: TODAY,
    now: new Date(2026, 10, 3, 7, 40),
  })

describe('buildContext', () => {
  const text = build(world())

  it('opens with the day and time, and the previous headline to avoid repeating it', () => {
    expect(text).toMatch(/^Hoje é terça-feira, 3 de novembro de 2026; agora são 07:40\./)
    expect(text).toContain('"Sono melhorando"')
  })

  it('lists the goals and habits', () => {
    expect(text).toContain('- Água: 3 L por dia.')
    expect(text).toContain('2.200 kcal, proteína 160 g')
    expect(text).toContain('- Hábito: Álcool (evitar).')
  })

  it('writes the last two weeks day by day, with the diary', () => {
    expect(text).toContain('- terça 3/11: sono 7h30 (nota 81)')
    expect(text).toContain('humor 3/5')
    expect(text).toContain('Diário: "Reunião longa, jantei tarde."')
    expect(text.match(/^- \S+ \d{1,2}\/\d{2}: sono/gm)).toHaveLength(14)
  })

  it('compares the last month with the one before, and adds what the statistics found', () => {
    expect(text).toContain('- Horas de sono: 7h30 (antes: 6h30)')
    expect(text).toMatch(/Depois de dias com «Álcool»: HRV da noite de \d+ ms, contra \d+ ms nos outros dias\./)
  })

  it('lists the workouts planned for the next week', () => {
    expect(text).toContain('## Treinos planejados (SisRUN, pelo Garmin)\n- quarta 4/11: Rodagem 8 km — Ritmo leve')
    expect(text).toContain('## Musculação programada no app\n- quinta 5/11: PULL DAY às 18:30')
  })

  it('puts the walks planned in the app among the planned workouts, by day and time', () => {
    const withWalks = buildContext({
      sources: world(),
      settings,
      planned: [{ date: shiftDay(TODAY, 1), title: 'Rodagem 8 km', time: new Date(2026, 10, 4, 6, 30).getTime() }],
      walkPlans: [
        { date: shiftDay(TODAY, 1), title: 'Caminhada de 40 min', time: '18:00' },
        { date: TODAY, title: 'Caminhada' },
      ],
      today: TODAY,
      now: new Date(2026, 10, 3, 7, 40),
    })
    expect(withWalks).toContain(
      '## Treinos planejados (SisRUN, pelo Garmin; caminhadas programadas no app)\n- terça 3/11: Caminhada\n- quarta 4/11 às 06:30: Rodagem 8 km\n- quarta 4/11 às 18:00: Caminhada de 40 min',
    )
  })

  it('stays well under the function limit', () => {
    expect(text.length).toBeLessThan(60_000)
  })
})

describe('hasRecentData', () => {
  it('needs a few days with data in the last week', () => {
    expect(hasRecentData(world(), TODAY)).toBe(true)
    expect(hasRecentData(empty, TODAY)).toBe(false)
  })
})

describe('parseInsight', () => {
  it('keeps the valid sections and fixes unknown areas', () => {
    const parsed = parseInsight({
      headline: ' Dia de recuperar ',
      model: 'claude-opus-5-5',
      sections: [
        { area: 'sono', title: 'Sono', text: 'Bom.', tips: ['Deitar 23h', 4, 'a', 'b'] },
        { area: 'outra', title: 'X', text: 'Y', tips: [] },
        { area: 'treino', title: 3 },
      ],
    })
    expect(parsed).toEqual({
      headline: 'Dia de recuperar',
      model: 'claude-opus-5-5',
      sections: [
        { area: 'sono', title: 'Sono', text: 'Bom.', tips: ['Deitar 23h', 'a', 'b'] },
        { area: 'geral', title: 'X', text: 'Y', tips: [] },
      ],
    })
  })

  it('rejects answers without a headline or any section', () => {
    expect(parseInsight({ sections: [{ area: 'sono', title: 'a', text: 'b', tips: [] }] })).toBeUndefined()
    expect(parseInsight({ headline: 'Oi', sections: [] })).toBeUndefined()
    expect(parseInsight(null)).toBeUndefined()
  })
})

describe('profile and weight goal', () => {
  it('puts what the person wrote about themselves and the weight goal in the summary', () => {
    const text = buildContext({
      sources: world(),
      settings: { ...settings, profile: 'Tenho tendinite no ombro.', weightGoal: { targetKg: 75, kgPerWeek: -0.5 } },
      planned: null,
      today: TODAY,
      now: new Date(2026, 10, 3, 7, 40),
    })
    expect(text).toContain('## Sobre a pessoa (escrito por ela)')
    expect(text).toContain('Tenho tendinite no ombro.')
    expect(text).toContain('- Peso: chegar a 75 kg (perder 0,5 kg por semana).')
  })
})

describe('what was said about a run', () => {
  it('goes with the run: the effort, the pain and the comment, on one line', () => {
    const run: Activity = {
      id: 'run',
      sport: 'running',
      title: 'Corrida 7 Km',
      date: TODAY,
      startTime: new Date(2026, 10, 3, 6, 30).getTime(),
      elapsedSec: 2700,
      timerSec: 2600,
      distanceM: 7050,
      laps: [],
      hasTrack: false,
      effort: 7,
      discomfort: ['knee'],
      notes: 'Tiros no ritmo.\nO último mais pesado.',
      ...meta,
    }
    const text = build({ ...world(), activities: [run] })
    expect(text).toContain(
      'treino: Corrida 7 Km: 7,1 km em 43 min, esforço 7/10, desconforto: joelho, comentário: "Tiros no ritmo. / O último mais pesado."',
    )
  })
})
