import { describe as group, expect, it } from 'vitest'
import type { Activity, DailyHealth, Habit, HabitLog, WeightEntry } from '../../db/types'
import { dayRange, dayTime, shiftDay } from '../../lib/dates'
import {
  analyze,
  byEffect,
  describe,
  highlights,
  lagFor,
  pairPoints,
  roundSplit,
  strongestFirst,
  testable,
  timingNote,
  type Finding,
} from './analysis'
import { buildDailyData, formatMetric, type Metric, type Sources } from './metrics'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const FROM = '2026-09-01'
const TO = '2026-10-30'
const days = dayRange(FROM, TO)

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

/** Every third day has the habit, and the night after it HRV runs 10 ms lower. */
function habitWorld(): Sources {
  const habit: Habit = {
    id: 'alcool',
    name: 'Álcool',
    kind: 'check',
    polarity: 'bad',
    startDate: FROM,
    archived: 0,
    order: 0,
    ...meta,
  }
  const habitLogs: HabitLog[] = days
    .filter((_, i) => i % 3 === 0)
    .map((date) => ({ id: `alcool:${date}`, habitId: 'alcool', date, value: 1, ...meta }))
  const drank = new Set(habitLogs.map((log) => log.date))
  const health: DailyHealth[] = days.map((date, i) => ({
    id: date,
    hrv: { lastNight: (drank.has(shiftDay(date, -1)) ? 50 : 60) + (i % 4) },
    sleep: { totalSec: 7 * 3600 + (i % 5) * 600 },
    ...meta,
  }))
  return { ...empty, habits: [habit], habitLogs, health }
}

const metric = (data: ReturnType<typeof buildDailyData>, key: string): Metric =>
  data.metrics.find((m) => m.key === key)!

group('daily data', () => {
  it('counts a habit as 0 on days without a log, and dates nights by their morning', () => {
    const data = buildDailyData(habitWorld(), FROM, TO)
    expect(data.rows.get(FROM)?.['habit:alcool']).toBe(1)
    expect(data.rows.get(shiftDay(FROM, 1))?.['habit:alcool']).toBe(0)
    const x = metric(data, 'habit:alcool')
    const y = metric(data, 'hrv')
    expect(lagFor(x, y)).toBe(1)
    // The habit on the 1st meets the HRV of the night that ends on the 2nd.
    expect(pairPoints(data, x, y)[0]).toEqual({ day: FROM, x: 1, y: 51 })
  })

  it('fills training with zeros only after the first known activity', () => {
    const run: Activity = {
      id: 'r',
      sport: 'running',
      date: '2026-10-10',
      startTime: 0,
      elapsedSec: 1800,
      timerSec: 1800,
      distanceM: 5000,
      laps: [],
      hasTrack: false,
      ...meta,
    }
    const data = buildDailyData({ ...empty, activities: [run] }, FROM, TO)
    expect(data.rows.get('2026-10-09')?.runKm).toBeUndefined()
    expect(data.rows.get('2026-10-10')?.runKm).toBe(5)
    expect(data.rows.get('2026-10-11')?.runKm).toBe(0)
  })

  it('records the first weigh-in of each day and the change since the day before', () => {
    const weights: WeightEntry[] = [
      { id: 'a', date: '2026-10-01', time: 1, weightKg: 80, source: 'manual', ...meta },
      { id: 'b', date: '2026-10-02', time: 3, weightKg: 79.6, source: 'manual', ...meta },
      { id: 'c', date: '2026-10-02', time: 2, weightKg: 79.8, source: 'manual', ...meta },
    ]
    const row = buildDailyData({ ...empty, weights }, FROM, TO).rows.get('2026-10-02')
    expect(row?.weight).toBe(79.8)
    expect(row?.weightChange).toBeCloseTo(-0.2, 6)
  })
})

group('findings', () => {
  it('finds the habit lowering the next night HRV and words it with both averages', () => {
    const data = buildDailyData(habitWorld(), FROM, TO)
    const found = highlights(data)
    expect(found[0]).toMatchObject({ kind: 'groups', lag: 1 })
    expect(found[0].x.key).toBe('habit:alcool')
    expect(found[0].y.key).toBe('hrv')
    expect(describe(found[0])).toMatch(/^Depois de dias com «Álcool»: HRV da noite de 5\d ms, contra 6\d ms nos outros dias\.$/)
  })

  it('stays quiet without enough days on both sides', () => {
    const world = habitWorld()
    const data = buildDailyData({ ...world, habitLogs: world.habitLogs.slice(0, 3) }, FROM, TO)
    expect(analyze(data, metric(data, 'habit:alcool'), metric(data, 'hrv'))).toBeUndefined()
    expect(highlights(data)).toEqual([])
  })

  it('shows two findings per cause before a third one of the same cause', () => {
    // Habit A moves three night measures a lot (and the readiness made of them), habit B moves deep sleep a little.
    const habit = (id: string): Habit => ({ id, name: id, kind: 'check', polarity: 'bad', startDate: FROM, archived: 0, order: 0, ...meta })
    const a = days.filter((_, i) => i % 3 === 0)
    const b = days.filter((_, i) => i % 2 === 1)
    const log = (habitId: string) => (date: string): HabitLog => ({ id: `${habitId}:${date}`, habitId, date, value: 1, ...meta })
    const afterA = new Set(a.map((date) => shiftDay(date, 1)))
    const afterB = new Set(b.map((date) => shiftDay(date, 1)))
    const health: DailyHealth[] = days.map((date, i) => ({
      id: date,
      hrv: { lastNight: (afterA.has(date) ? 50 : 60) + (i % 5) },
      restingHr: (afterA.has(date) ? 54 : 50) + (i % 5),
      sleep: {
        totalSec: 7 * 3600,
        score: (afterA.has(date) ? 70 : 80) + (i % 7),
        deepSec: ((afterB.has(date) ? 1.2 : 1.27) + (i % 5) * 0.05) * 3600,
      },
      ...meta,
    }))
    const sources = { ...empty, habits: [habit('a'), habit('b')], habitLogs: [...a.map(log('a')), ...b.map(log('b'))], health }
    const pairs = highlights(buildDailyData(sources, FROM, TO), 4).map((finding) => `${finding.x.key} > ${finding.y.key}`)
    expect(pairs).toEqual(['habit:a > readiness', 'habit:a > hrv', 'habit:b > deepHours', 'habit:a > sleepScore'])
  })

  it('ranks a strong trend above a moderate difference between groups', () => {
    const moderate = { kind: 'groups', strength: 0.7 } as Finding
    const strong = { kind: 'trend', strength: 0.6 } as Finding
    const weak = { kind: 'trend', strength: 0.25 } as Finding
    expect([weak, moderate, strong].sort(strongestFirst)).toEqual([strong, moderate, weak])
  })

  it('splits a trend at a round number while each side keeps a quarter of the days', () => {
    const split = (steps: (i: number) => number) => {
      const health: DailyHealth[] = days.map((date, i) => ({
        id: date,
        steps: steps(i),
        sleep: { totalSec: 7 * 3600, score: 70 + (i % 7) },
        ...meta,
      }))
      const data = buildDailyData({ ...empty, health }, FROM, TO)
      const finding = analyze(data, metric(data, 'steps'), metric(data, 'sleepScore'))
      return finding?.kind === 'trend' ? finding.split : undefined
    }
    expect(split((i) => 5123 + (i % 10) * 1000)).toBe(9100)
    // 8.000 would leave 6 days on one side: the exact median instead.
    expect(split((i) => 8000 + (i % 10) * 10)).toBe(8040)
  })
})

group('new measures in the findings', () => {
  const activity = (date: string, extra: Partial<Activity>): Activity => ({
    id: `a-${date}`,
    sport: 'running',
    date,
    startTime: dayTime(date, '07:00'),
    elapsedSec: 2400,
    timerSec: 2400,
    distanceM: 8000,
    laps: [],
    hasTrack: false,
    ...meta,
    ...extra,
  })

  it('finds the heat raising the heart rate of the run, said of that same run', () => {
    const activities = days.map((date, i) => {
      const tempC = 14 + (i % 16)
      return activity(date, { avgHr: Math.round(128 + tempC * 0.9 + (i % 3)), weather: { tempC, humidity: 70 } })
    })
    const found = highlights(buildDailyData({ ...empty, activities }, FROM, TO))
    expect(found.map((finding) => `${finding.x.key} > ${finding.y.key}`)).toEqual(['runTemp > runHr'])
    expect(describe(found[0])).toMatch(/^Temperatura na corrida acima de \d+ °C: FC média da corrida de \d+ bpm; nas outras corridas, \d+ bpm\.$/)
  })

  it('finds a hard day lowering the next night’s HRV, but never the readiness made of the training', () => {
    const hard = new Set(days.filter((_, i) => i % 3 === 0))
    const activities = days.map((date, i) => {
      // Minutes in zones 2 and 4: hard days well above the easy ones, all a little different.
      const seconds = hard.has(date) ? [0, 0, 600, 0, (40 + (i % 5) * 4) * 60, 0] : [0, 0, (15 + (i % 4) * 3) * 60, 0, 0, 0]
      return activity(date, { sport: 'cycling', hrZones: { seconds, limits: [110, 125, 140, 155, 170, 185] } })
    })
    const health: DailyHealth[] = days.map((date, i) => ({
      id: date,
      hrv: { lastNight: (hard.has(shiftDay(date, -1)) ? 48 : 58) + (i % 4) },
      sleep: { totalSec: 7 * 3600, score: 75 + (i % 6) },
      restingHr: 50 + (i % 3),
      ...meta,
    }))
    const data = buildDailyData({ ...empty, activities, health }, FROM, TO)
    const found = highlights(data, 30)
    const load = found.find((finding) => finding.x.key === 'trainingLoad' && finding.y.key === 'hrv')
    expect(load && describe(load)).toMatch(/^Carga de treino acima de \d+: HRV da noite de \d+ ms na noite seguinte; nos outros dias, \d+ ms\.$/)
    const training = new Set(data.metrics.filter((m) => m.group === 'Treino' || m.group === 'Corrida').map((m) => m.key))
    expect(found.filter((finding) => finding.y.key === 'readiness' && training.has(finding.x.key))).toEqual([])
  })
})

group('pairing rules', () => {
  const data = buildDailyData(empty, FROM, TO)
  const m = (key: string) => metric(data, key)

  it('compares the weather of a run only with that same run', () => {
    expect(testable(m('runTemp'), m('runHr'))).toBe(true)
    expect(testable(m('runHumidity'), m('runPace'))).toBe(true)
    expect(testable(m('runTemp'), m('hrv'))).toBe(false)
    expect(testable(m('runTemp'), m('effort'))).toBe(false)
    expect(lagFor(m('runTemp'), m('runHr'))).toBe(0)
  })

  it('never explains the readiness with what it is computed from, but lets it explain the day', () => {
    expect(testable(m('trainingLoad'), m('readiness'))).toBe(false)
    expect(testable(m('runEffort'), m('readiness'))).toBe(false)
    expect(testable(m('pain'), m('readiness'))).toBe(false)
    expect(testable(m('kcal'), m('readiness'))).toBe(true)
    expect(testable(m('trainingLoad'), m('hrv'))).toBe(true)
    expect(testable(m('readiness'), m('runEffort'))).toBe(true)
    expect(lagFor(m('readiness'), m('runEffort'))).toBe(0)
  })

  it('says when the effect is measured', () => {
    expect(timingNote(m('trainingLoad'), m('hrv'))).toBe('na noite seguinte')
    expect(timingNote(m('kcal'), m('weightChange'))).toBe('na manhã seguinte')
    expect(timingNote(m('readiness'), m('runEffort'))).toBe('no mesmo dia')
    expect(timingNote(m('sleepScore'), m('runEffort'))).toBe('no dia seguinte à noite')
    expect(timingNote(m('bedtime'), m('sleepScore'))).toBe('na mesma noite')
    expect(timingNote(m('runTemp'), m('runHr'))).toBe('na mesma corrida')
    expect(timingNote(m('kcal'), m('steps'))).toBe('no mesmo dia')
  })
})

group('wording of the new measures', () => {
  const data = buildDailyData(empty, FROM, TO)
  const m = (key: string) => metric(data, key)
  const trend = (x: string, y: string, split: number, highMean: number, lowMean: number, strength = 0.4): Finding => ({
    kind: 'trend',
    x: m(x),
    y: m(y),
    lag: lagFor(m(x), m(y)),
    n: 40,
    p: 0.01,
    strength,
    rho: -strength,
    split,
    highMean,
    lowMean,
  })

  it('reads the morning, the wake time and the next weigh-in', () => {
    expect(describe(trend('readiness', 'runEffort', 70, 5.2, 6.4))).toBe('Prontidão acima de 70: esforço da corrida de 5,2 no mesmo dia; nos outros dias, 6,4.')
    expect(describe(trend('wakeTime', 'energy', 7.5, 3.2, 3.8))).toBe('Acordando depois das 07:30: energia de 3,2 no mesmo dia; antes disso, 3,8.')
    expect(describe(trend('trainingLoad', 'weightChange', 120, -0.3, 0.1))).toBe(
      'Carga de treino acima de 120: variação do peso de -0,3 kg na manhã seguinte; nos outros dias, +0,1 kg.',
    )
  })

  it('puts the number first for a share of the workouts or a count', () => {
    expect(describe(trend('form', 'discomfort', -10, 15, 40))).toBe(
      'Forma (TSB) acima de -10: 15% dos treinos com desconforto no mesmo dia; nos outros dias, 40%.',
    )
    const pain: Finding = { kind: 'groups', x: m('pain'), y: m('awakenings'), lag: 1, n: 40, p: 0.01, strength: 0.6, withMean: 3.4, withoutMean: 2, nWith: 12, nWithout: 28 }
    expect(describe(pain)).toBe('Depois de dias com dor: 3,4 despertares, contra 2 nos outros dias.')
  })

  it('says "em" for days compared with themselves, and "mais lento" for a pace', () => {
    const gym: Finding = { kind: 'groups', x: m('strengthDay'), y: m('kcal'), lag: 0, n: 40, p: 0.01, strength: 0.6, withMean: 2400, withoutMean: 2100, nWith: 15, nWithout: 25 }
    expect(describe(gym)).toBe('Em dias de musculação: calorias consumidas de 2.400 kcal, contra 2.100 kcal nos outros dias.')
    expect(describe(trend('runPace', 'hrv', 330, 52, 57))).toBe('Ritmo da corrida mais lento que 5:30 /km: HRV da noite de 52 ms na noite seguinte; nos outros dias, 57 ms.')
  })

  it('groups the findings by what they explain, the strongest first', () => {
    const found = [
      trend('trainingLoad', 'hrv', 100, 50, 56, 0.35),
      trend('bedtime', 'sleepScore', 23.5, 72, 80, 0.6),
      trend('readiness', 'runEffort', 70, 5, 6, 0.45),
      trend('kcal', 'hrv', 2400, 52, 57, 0.55),
    ]
    expect(byEffect(found).map(({ group, findings }) => `${group}: ${findings.map((finding) => finding.x.key).join(', ')}`)).toEqual([
      'Sono: bedtime',
      'Recuperação: kcal, trainingLoad',
      'Corrida: readiness',
    ])
  })
})

group('roundSplit', () => {
  const data = buildDailyData(empty, FROM, TO)
  it('rounds to quarter hours, 5 minutes or two significant digits', () => {
    expect(roundSplit(metric(data, 'bedtime'), 23.517)).toBe(23.5)
    expect(roundSplit(metric(data, 'sleepHours'), 7.1)).toBe(7)
    expect(roundSplit(metric(data, 'activityMinutes'), 37)).toBe(35)
    expect(roundSplit(metric(data, 'steps'), 8423)).toBe(8400)
    expect(roundSplit(metric(data, 'water'), 2.37)).toBeCloseTo(2.4, 9)
    expect(roundSplit(metric(data, 'runKm'), 0)).toBe(0)
  })
})

group('formatMetric', () => {
  const data = buildDailyData(empty, FROM, TO)
  it('reads durations, clock times and units', () => {
    expect(formatMetric(metric(data, 'sleepHours'), 7.25)).toBe('7h15')
    expect(formatMetric(metric(data, 'bedtime'), 23.5)).toBe('23:30')
    expect(formatMetric(metric(data, 'bedtime'), 24.75)).toBe('00:45')
    expect(formatMetric(metric(data, 'hrv'), 52.4)).toBe('52 ms')
    expect(formatMetric(metric(data, 'steps'), 9800)).toBe('9.800')
  })

  it('signs a change and never shows "-0"', () => {
    const change = metric(data, 'weightChange')
    expect(formatMetric(change, 0.109)).toBe('+0,11 kg')
    expect(formatMetric(change, -0.146)).toBe('-0,15 kg')
    expect(formatMetric(change, -0.001)).toBe('0 kg')
  })
})

group('last meal of the day', () => {
  const log = (date: string, clock: string, kcal: number) => ({
    id: `${date}-${clock}`,
    date,
    meal: 'dinner' as const,
    time: dayTime(date, clock),
    foodId: 'x',
    name: 'x',
    grams: 100,
    nutrients: { kcal, protein: 0, carbs: 0, fat: 0 },
    updatedAt: 0,
    deleted: 0 as const,
    dirty: 0 as const,
  })

  it('takes the latest food with calories on days logged in full, a late supper as 24+', () => {
    const data = buildDailyData(
      {
        ...empty,
        foodLogs: [
          log('2026-10-01', '12:00', 900),
          log('2026-10-01', '21:30', 600),
          log('2026-10-01', '22:10', 2), // coffee: no calories, not a meal
          log('2026-10-02', '13:00', 1200),
          log('2026-10-02', '00:30', 300),
          log('2026-10-03', '08:00', 400), // only breakfast logged
        ],
      },
      '2026-10-01',
      '2026-10-03',
    )
    expect(data.rows.get('2026-10-01')?.lastMeal).toBe(21.5)
    expect(data.rows.get('2026-10-02')?.lastMeal).toBe(24.5)
    expect(data.rows.get('2026-10-03')?.lastMeal).toBeUndefined()
  })
})
