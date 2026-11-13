import { describe, expect, it } from 'vitest'
import type { Activity, ActivityLap, DailyHealth, FoodLog, Habit, HabitLog, Pain, PlannedStep, SleepStageSpan, WorkoutSession } from '../../db/types'
import { dayKey, dayRange, dayTime, shiftDay } from '../../lib/dates'
import { dailyLoads, loadSeries, loadStatus } from '../running/load'
import { readiness } from '../running/readiness'
import { testable } from './analysis'
import { awakenings, buildDailyData, formatMetric, metricAxis, stepsOnTarget, type Metric, type Sources } from './metrics'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
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

const activity = (id: string, date: string, extra: Partial<Activity> = {}): Activity => ({
  id,
  sport: 'running',
  date,
  startTime: dayTime(date, '07:00'),
  elapsedSec: 1800,
  timerSec: 1800,
  distanceM: 5000,
  laps: [],
  hasTrack: false,
  ...meta,
  ...extra,
})

const metricOf = (data: ReturnType<typeof buildDailyData>, key: string): Metric => data.metrics.find((m) => m.key === key)!

describe('buildDailyData habits', () => {
  const sun: Habit = { id: 'sun', name: 'Sol', kind: 'check', polarity: 'good', startDate: '2026-10-01', archived: 0, order: 0, ...meta }
  const log = (date: string, value: number, skipped?: 1): HabitLog => ({ id: `sun:${date}`, habitId: 'sun', date, value, skipped, ...meta })

  it('reads a day without a log as not done, and a skipped day as missing', () => {
    const data = buildDailyData(
      { ...empty, habits: [sun], habitLogs: [log('2026-10-01', 1), log('2026-10-02', 0, 1)] },
      '2026-10-01',
      '2026-10-03',
    )
    expect(data.rows.get('2026-10-01')?.['habit:sun']).toBe(1)
    expect(data.rows.get('2026-10-02')?.['habit:sun']).toBeUndefined()
    expect(data.rows.get('2026-10-03')?.['habit:sun']).toBe(0)
  })
})

describe('training load, form and readiness', () => {
  const FROM = '2026-07-01'
  const TO = '2026-09-30'
  // 10 min in zone 1 and 10 in zone 2: a TRIMP of 30. Every other day, and a big one on the last.
  const zoned = (date: string, minutes = [0, 10, 10, 0, 0, 0]) =>
    activity(`a-${date}`, date, { hrZones: { seconds: minutes.map((m) => m * 60), limits: [110, 125, 140, 155, 170, 185] } })
  const activities = [
    ...dayRange(FROM, shiftDay(TO, -1))
      .filter((_, i) => i % 2 === 0)
      .map((date) => zoned(date)),
    zoned(TO, [0, 0, 0, 30, 30, 20]),
  ]
  const health: DailyHealth[] = dayRange(shiftDay(TO, -35), TO).map((date, i) => ({
    id: date,
    sleep: { totalSec: 7 * 3600, score: 78 },
    hrv: { lastNight: 55 + (i % 5) },
    restingHr: 50 + (i % 3),
    ...meta,
  }))
  const data = buildDailyData({ ...empty, activities, health }, FROM, TO)
  const series = loadSeries(dailyLoads(activities), TO)

  it('takes each day its TRIMP, zero on the days between', () => {
    expect(data.rows.get(FROM)?.trainingLoad).toBe(30)
    expect(data.rows.get(shiftDay(FROM, 1))?.trainingLoad).toBe(0)
    expect(data.rows.get(TO)?.trainingLoad).toBe(30 * 3 + 30 * 4 + 20 * 5)
  })

  it('gives each morning the form the day before ended with, once fitness had 6 weeks', () => {
    // 42 days after the first load is the first evening that counts.
    expect(data.rows.get(shiftDay(FROM, 42))?.form).toBeUndefined()
    const morning = shiftDay(FROM, 43)
    expect(data.rows.get(morning)?.form).toBeCloseTo(series.find((day) => day.date === shiftDay(FROM, 42))!.tsb, 9)
  })

  it('reads the readiness of the morning, before that day’s workout', () => {
    const before = shiftDay(TO, -1)
    const morning = readiness({ date: TO, health, load: loadStatus(series, before) })!.score
    // The big workout of the day itself would have lowered it: that one counts for the next morning.
    const afterwards = readiness({ date: TO, health, load: loadStatus(series, TO) })!.score
    expect(morning).not.toBe(afterwards)
    expect(data.rows.get(TO)?.readiness).toBe(morning)
    // Without the night's data there is no readiness, only the load.
    expect(data.rows.get(FROM)?.readiness).toBeUndefined()
  })
})

describe('the day’s runs', () => {
  const DAY = '2026-10-10'

  it('weights the pace and the heart rate by time, and averages the effort and the weather', () => {
    const data = buildDailyData(
      {
        ...empty,
        activities: [
          activity('easy', DAY, { distanceM: 5000, timerSec: 1500, avgHr: 150, effort: 6, weather: { tempC: 20, humidity: 60 } }),
          activity('long', DAY, { distanceM: 10_000, timerSec: 3300, avgHr: 140, effort: 4, weather: { tempC: 26, humidity: 80 } }),
          activity('walk', '2026-10-11', { sport: 'walking', distanceM: 4000, timerSec: 2700, avgHr: 100, effort: 2 }),
          activity('treadmill', '2026-10-12', { subSport: 'treadmill', distanceM: undefined, avgHr: 145 }),
        ],
      },
      '2026-10-01',
      '2026-10-31',
    )
    const row = data.rows.get(DAY)!
    expect(row.runPace).toBe(320)
    expect(formatMetric(metricOf(data, 'runPace'), row.runPace)).toBe('5:20 /km')
    expect(row.runHr).toBeCloseTo((150 * 1500 + 140 * 3300) / 4800, 9)
    expect(row.runEffort).toBe(5)
    expect(row.runTemp).toBeCloseTo((20 * 1500 + 26 * 3300) / 4800, 9)
    expect(row.runHumidity).toBeCloseTo((60 * 1500 + 80 * 3300) / 4800, 9)
    // A walk is not a run; a run without a distance has a heart rate but no pace.
    expect(data.rows.get('2026-10-11')?.runHr).toBeUndefined()
    expect(data.rows.get('2026-10-12')?.runPace).toBeUndefined()
    expect(data.rows.get('2026-10-12')?.runHr).toBe(145)
  })

  it('counts the planned steps with a target that hit it', () => {
    // 4:30–4:40 /km reps, as the compliance tests have them.
    const pace = { targetType: 'SPEED', targetValue: 0, targetLow: 1000 / 280, targetHigh: 1000 / 270 }
    const steps: PlannedStep[] = [
      { index: 0, intensity: 'WARMUP', durationType: 'TIME', durationValue: 600 },
      { index: 1, intensity: 'INTERVAL', durationType: 'DISTANCE', durationValue: 800, ...pace },
      { index: 2, intensity: 'RECOVERY', durationType: 'TIME', durationValue: 90, targetType: 'OPEN' },
      { index: 3, durationType: 'REPEAT_UNTIL_STEPS_CMPLT', durationValue: 1, targetValue: 4 },
      { index: 4, intensity: 'COOLDOWN', durationType: 'OPEN' },
    ]
    let clock = 0
    const lap = (timerSec: number, distanceM: number): ActivityLap => {
      clock += timerSec * 1000
      return { startTime: clock, elapsedSec: timerSec, timerSec, distanceM, avgSpeed: distanceM / timerSec }
    }
    const laps = [lap(600, 1800), ...[275, 290, 272, 265].flatMap((p) => [lap((p * 800) / 1000, 800), lap(90, 220)]), lap(420, 1100)]
    const run = activity('reps', DAY, { workout: { steps }, laps })
    expect(stepsOnTarget(run)).toEqual({ hit: 2, steps: 4 })
    const data = buildDailyData({ ...empty, activities: [run, activity('free', DAY)] }, DAY, DAY)
    expect(data.rows.get(DAY)?.onTarget).toBe(50)
  })
})

describe('the gym, discomfort and pains', () => {
  const session = (id: string, date: string, extra: Partial<WorkoutSession> = {}): WorkoutSession => ({
    id,
    name: 'A',
    date,
    startedAt: dayTime(date, '18:00'),
    endedAt: dayTime(date, '19:00'),
    exercises: [
      {
        key: 'e1',
        exerciseId: 'squat',
        restSec: 120,
        sets: [
          { key: 's0', kind: 'warmup', weightKg: 40, reps: 10, done: true },
          { key: 's1', kind: 'normal', weightKg: 60, reps: 8, done: true, rir: 2 },
          { key: 's2', kind: 'normal', weightKg: 60, reps: 8, done: true, rir: 1 },
          { key: 's3', kind: 'normal', weightKg: 60, reps: 6, done: false },
        ],
      },
    ],
    ...meta,
    ...extra,
  })

  it('adds up the work sets, without the warm-up or what was not done, and averages their RIR', () => {
    const row = buildDailyData({ ...empty, sessions: [session('s', '2026-10-02')] }, '2026-10-01', '2026-10-03').rows.get('2026-10-02')
    expect(row?.gymVolume).toBe(960)
    expect(row?.gymRir).toBe(1.5)
  })

  it('tells discomfort only on the days a workout was told about', () => {
    const data = buildDailyData(
      {
        ...empty,
        activities: [
          activity('ok', '2026-10-01', { effort: 5 }),
          activity('knee', '2026-10-02', { discomfort: ['knee'] }),
          activity('untold', '2026-10-03'),
          activity('easy', '2026-10-04', { effort: 4 }),
        ],
        sessions: [session('sore', '2026-10-04', { effort: 7, discomfort: ['back'] })],
      },
      '2026-10-01',
      '2026-10-05',
    )
    expect([1, 2, 3, 4].map((d) => data.rows.get(`2026-10-0${d}`)?.discomfort)).toEqual([0, 100, undefined, 100])
    expect(formatMetric(metricOf(data, 'discomfort'), 25)).toBe('25%')
  })

  it('marks the days with a pain going on, from the first pain told up to today', () => {
    const today = dayKey()
    const pain = (start: string, end?: string): Pain => ({ id: start, name: 'canela', start, end, scores: { [start]: 4 }, ...meta })
    const from = shiftDay(today, -10)
    const data = buildDailyData({ ...empty, pains: [pain(shiftDay(today, -8), shiftDay(today, -6)), pain(shiftDay(today, -1))] }, from, shiftDay(today, 2))
    const value = (offset: number) => data.rows.get(shiftDay(today, offset))?.pain
    expect([-9, -8, -6, -5, -1, 0, 1].map(value)).toEqual([undefined, 1, 1, 0, 1, 1, undefined])
  })
})

describe('sleep from the stages and the clock', () => {
  const at = (clock: string, date = '2026-10-02') => dayTime(date, clock)
  const span = (stage: SleepStageSpan['stage'], start: string, end: string, startDate = '2026-10-02', endDate = startDate): SleepStageSpan => ({
    stage,
    start: at(start, startDate),
    end: at(end, endDate),
  })

  it('counts the awakenings between stretches of sleep, not falling asleep, a blip or getting up', () => {
    const night = [
      span('awake', '23:00', '23:10', '2026-10-01'),
      span('light', '23:10', '01:00', '2026-10-01', '2026-10-02'),
      { stage: 'awake' as const, start: at('01:00'), end: at('01:00') + 30_000 },
      span('deep', '01:01', '03:00'),
      span('awake', '03:00', '03:05'),
      span('rem', '03:05', '06:30'),
      span('awake', '06:30', '06:45'),
    ]
    expect(awakenings(night)).toBe(1)
    expect(awakenings([span('awake', '01:00', '02:00')])).toBeUndefined()
  })

  it('reads the bedtime past midnight as 24+ and the wake time as the clock', () => {
    const health: DailyHealth[] = [
      { id: '2026-10-02', sleep: { totalSec: 7 * 3600, start: at('23:30', '2026-10-01'), end: at('06:45') }, ...meta },
      { id: '2026-10-03', sleep: { totalSec: 6 * 3600, start: at('00:30', '2026-10-03'), end: at('07:15', '2026-10-03') }, ...meta },
    ]
    const data = buildDailyData({ ...empty, health }, '2026-10-01', '2026-10-03')
    expect(data.rows.get('2026-10-02')).toMatchObject({ bedtime: 23.5, wakeTime: 6.75 })
    expect(data.rows.get('2026-10-03')).toMatchObject({ bedtime: 24.5, wakeTime: 7.25 })
  })

  /** Nights ending on each day from 2026-10-01, at 23:00 unless `bed` says otherwise, `hours` long. */
  const nights = (count: number, hours = 7, bed: (i: number) => string = () => '23:00'): DailyHealth[] =>
    Array.from({ length: count }, (_, i) => {
      const id = shiftDay('2026-10-01', i)
      const clock = bed(i)
      const start = dayTime(clock < '12:00' ? id : shiftDay(id, -1), clock)
      return { id, sleep: { totalSec: hours * 3600, start, end: start + hours * 3_600_000 }, ...meta }
    })

  it('adds the last 7 nights against the goal, once 5 of them have sleep', () => {
    const data = buildDailyData({ ...empty, health: nights(9, 7) }, '2026-10-01', '2026-10-09')
    expect(data.rows.get('2026-10-04')?.sleepBalance).toBeUndefined()
    // Five nights an hour short of the default 8 hours, then seven.
    expect(data.rows.get('2026-10-05')?.sleepBalance).toBe(-5)
    expect(data.rows.get('2026-10-09')?.sleepBalance).toBe(-7)
    const goal = buildDailyData({ ...empty, health: nights(9, 7), sleepGoalMin: 420 }, '2026-10-01', '2026-10-09')
    expect(goal.rows.get('2026-10-09')?.sleepBalance).toBe(0)
    expect(formatMetric(metricOf(data, 'sleepBalance'), -7)).toBe('−7h00')
    expect(formatMetric(metricOf(data, 'sleepBalance'), 0.5)).toBe('+30 min')
    expect(formatMetric(metricOf(data, 'sleepBalance'), 0)).toBe('0 min')
  })

  it('measures how far a bedtime was from the mean of the 14 nights before', () => {
    // Five nights at 23:00, then one at 00:30 and one at 22:00.
    const health = nights(7, 7, (i) => (i === 5 ? '00:30' : i === 6 ? '22:00' : '23:00'))
    const data = buildDailyData({ ...empty, health }, '2026-10-01', '2026-10-07')
    expect(data.rows.get('2026-10-05')?.bedtimeShift).toBeUndefined()
    expect(data.rows.get('2026-10-06')?.bedtimeShift).toBeCloseTo(90)
    // The usual now leans 15 minutes later: (5 × 23 + 24.5) / 6 = 23.25.
    expect(data.rows.get('2026-10-07')?.bedtimeShift).toBeCloseTo(75)
  })

  it('pairs the balance and the bedtime with the right days', () => {
    const data = buildDailyData(empty, '2026-10-01', '2026-10-01')
    const balance = metricOf(data, 'sleepBalance')
    const shift = metricOf(data, 'bedtimeShift')
    // The balance explains the next day and is explained by the days before; its own bedtime would only find the formula.
    expect(testable(balance, metricOf(data, 'mood'))).toBe(true)
    expect(testable(metricOf(data, 'kcal'), balance)).toBe(true)
    expect(testable(metricOf(data, 'bedtime'), balance)).toBe(false)
    expect(testable(balance, metricOf(data, 'hrv'))).toBe(false)
    expect(testable(shift, metricOf(data, 'energy'))).toBe(true)
    expect(testable(metricOf(data, 'kcal'), shift)).toBe(false)
  })
})

describe('energy balance', () => {
  const food = (date: string, kcal: number): FoodLog => ({
    id: `${date}-${kcal}`,
    date,
    meal: 'lunch',
    time: dayTime(date, '12:00'),
    foodId: 'x',
    name: 'x',
    grams: 100,
    nutrients: { kcal, protein: 0, carbs: 0, fat: 0 },
    ...meta,
  })

  it('takes what the watch burned from what was eaten, on days logged in full and already over', () => {
    const today = dayKey()
    const yesterday = shiftDay(today, -1)
    const before = shiftDay(today, -2)
    const burned = (id: string): DailyHealth => ({ id, calories: { total: 2500, active: 600 }, ...meta })
    const data = buildDailyData(
      { ...empty, foodLogs: [food(before, 2200), food(yesterday, 800), food(today, 3000)], health: [burned(before), burned(yesterday), burned(today)] },
      before,
      today,
    )
    expect(data.rows.get(before)?.balance).toBe(-300)
    expect(formatMetric(metricOf(data, 'balance'), 120)).toBe('+120 kcal')
    // Breakfast alone isn't the day; today's burn is still going up.
    expect(data.rows.get(yesterday)?.balance).toBeUndefined()
    expect(data.rows.get(today)?.balance).toBeUndefined()
  })
})

describe('metricAxis', () => {
  const data = buildDailyData(empty, '2026-10-01', '2026-10-02')
  it('puts paces on round seconds and hours on quarter hours', () => {
    expect(metricAxis(metricOf(data, 'runPace'), [298, 341])).toEqual({ min: 290, max: 350, interval: 10 })
    expect(metricAxis(metricOf(data, 'sleepHours'), [6.1, 7.4])).toEqual({ min: 6, max: 7.5, interval: 0.5 })
    expect(metricAxis(metricOf(data, 'hrv'), [40, 60])).toEqual({})
  })
})
