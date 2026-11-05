import { describe, expect, it } from 'vitest'
import { DEFAULT_MEASUREMENT_SITES } from '../../db/schema'
import type { Activity, ActivityStream, DailyHealth, Exercise, Habit, HabitLog, SessionExercise, WorkoutSession } from '../../db/types'
import { dayRange, shiftDay, type DayKey } from '../../lib/dates'
import { buildRecap, defaultYear, looksLikeRace, recapBannerYear, recapText, recapYears, yearBounds, type RecapSources } from './recap'

const meta = { updatedAt: 0, deleted: 0 as const, dirty: 0 as const }
const today = '2026-11-05'
const at = (date: DayKey, clock = '07:00') => Date.parse(`${date}T${clock}:00`)

const activity = (id: string, date: DayKey, changes: Partial<Activity> = {}): Activity => ({
  ...meta,
  id,
  date,
  sport: 'running',
  startTime: at(date),
  elapsedSec: 1800,
  timerSec: 1800,
  distanceM: 5000,
  laps: [],
  hasTrack: true,
  ...changes,
})

/** A run at an even pace: its distance every second. */
const evenStream = (meters: number, seconds: number): Pick<ActivityStream, 'step' | 'distance'> => ({
  step: 1,
  distance: Array.from({ length: seconds + 1 }, (_, i) => (meters * i) / seconds),
})

const sets = (count: number, weightKg: number, reps: number) =>
  Array.from({ length: count }, (_, i) => ({ key: `s${i}`, kind: 'normal' as const, weightKg, reps, done: true }))

const lift = (exerciseId: string, list: SessionExercise['sets']): SessionExercise => ({ key: exerciseId, exerciseId, restSec: 90, sets: list })

const session = (id: string, date: DayKey, exercises: SessionExercise[], ended = true): WorkoutSession => ({
  ...meta,
  id,
  name: 'Treino',
  date,
  startedAt: at(date, '18:00'),
  endedAt: ended ? at(date, '19:00') : undefined,
  exercises,
})

const habit = (id: string, changes: Partial<Habit> = {}): Habit => ({
  ...meta,
  id,
  name: id,
  kind: 'check',
  polarity: 'good',
  startDate: '2026-01-01',
  archived: 0,
  order: 0,
  ...changes,
})
const log = (habitId: string, date: DayKey, value = 1, skipped?: 1): HabitLog => ({ ...meta, id: `${habitId}:${date}`, habitId, date, value, skipped })

const night = (date: DayKey, hours: number, score: number): DailyHealth => ({ ...meta, id: date, sleep: { totalSec: hours * 3600, score } })

function sources(): RecapSources {
  const exercises = new Map<string, Exercise>([
    ['bench', { ...meta, id: 'bench', name: 'Supino reto', muscle: 'chest', equipment: 'barbell', type: 'weight_reps' }],
    ['squat', { ...meta, id: 'squat', name: 'Agachamento', muscle: 'quads', equipment: 'barbell', type: 'weight_reps' }],
  ])
  return {
    activities: [
      activity('r2025', '2025-06-01', { timerSec: 1550 }),
      activity('r1', '2026-03-10', { distanceM: 5200, timerSec: 1500 }),
      activity('r2', '2026-05-01', { distanceM: 10500, timerSec: 3300 }),
      activity('race', '2026-10-12', { distanceM: 7000, timerSec: 2100, title: 'Rústica de Morungava 2026 (6 a 8km)' }),
      activity('treadmill', '2026-08-20', { subSport: 'treadmill', distanceM: 3000, timerSec: 900 }),
      activity('walk', '2026-04-02', { sport: 'walking', distanceM: 3000, timerSec: 2400 }),
      activity('hike', '2026-07-15', { sport: 'hiking', distanceM: 8000, timerSec: 10800 }),
      activity('watchGym', '2026-02-03', { sport: 'training', subSport: 'strengthTraining', distanceM: undefined, timerSec: 3600 }),
    ],
    streams: new Map([
      ['r2025', evenStream(5000, 1550)],
      ['r1', evenStream(5200, 1500)],
      ['r2', evenStream(10500, 3300)],
    ]),
    sessions: [
      session('s2025', '2025-12-30', [lift('bench', sets(3, 100, 5))]),
      session('s1', '2026-02-03', [lift('bench', sets(3, 60, 10)), lift('squat', sets(4, 80, 8))]),
      session('s2', '2026-04-10', [lift('bench', sets(3, 70, 8)), lift('squat', sets(4, 100, 5))]),
      session('s3', '2026-06-15', [lift('bench', sets(3, 75, 8)), lift('squat', sets(4, 110, 5))]),
      session('open', '2026-06-16', [lift('bench', sets(3, 200, 5))], false),
    ],
    exercises,
    health: [
      { ...meta, id: '2025-12-31', steps: 30000 },
      { ...meta, id: '2026-01-10', steps: 8000 },
      { ...meta, id: '2026-03-05', steps: 20000 },
      { ...meta, id: '2026-07-01', steps: 12000 },
      ...dayRange('2026-01-11', '2026-01-20').map((date) => night(date, 7, 70)),
      ...dayRange('2026-07-02', '2026-07-09').map((date) => night(date, 8, 85)),
    ],
    weights: [
      { ...meta, id: 'w0', date: '2025-12-20', time: at('2025-12-20'), weightKg: 90, source: 'manual' },
      { ...meta, id: 'w1', date: '2026-01-05', time: at('2026-01-05'), weightKg: 88, bodyFatPct: 25, source: 'manual' },
      { ...meta, id: 'w2', date: '2026-03-01', time: at('2026-03-01'), weightKg: 86, source: 'manual' },
      { ...meta, id: 'w3', date: '2026-06-01', time: at('2026-06-01'), weightKg: 84, source: 'manual' },
      { ...meta, id: 'w4', date: '2026-11-01', time: at('2026-11-01'), weightKg: 83, bodyFatPct: 22, source: 'manual' },
    ],
    measurements: [
      { ...meta, id: 'm1', date: '2026-02-01', values: { waist: 90, chest: 100 } },
      { ...meta, id: 'm2', date: '2026-09-01', values: { waist: 85 } },
      { ...meta, id: 'm3', date: '2026-10-01', values: { waist: 84, arm_r: 35 } },
    ],
    habits: [
      habit('Creatina'),
      habit('Álcool', { polarity: 'bad', startDate: '2026-06-01' }),
      habit('Correr', { startDate: '2026-10-01', frequency: { times: 2, per: 'week' } }),
      habit('Antigo', { archived: 1, startDate: '2025-01-01' }),
    ],
    habitLogs: [
      ...dayRange('2026-01-01', '2026-01-10').map((date) => log('Creatina', date)),
      log('Creatina', '2026-01-11', 0, 1),
      ...dayRange('2026-01-12', '2026-01-14').map((date) => log('Creatina', date)),
      log('Álcool', '2026-06-05'),
      log('Álcool', '2026-06-20'),
      ...['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-19', '2026-10-20', '2026-10-22', '2026-10-26', '2026-10-28'].map((date) =>
        log('Correr', date),
      ),
    ],
    foodLogs: [
      { date: '2026-01-10', kcal: 2000, protein: 150 },
      { date: '2026-02-03', kcal: 2400, protein: 120 },
      { date: today, kcal: 800, protein: 40 },
    ].map(({ date, kcal, protein }, i) => ({
      ...meta,
      id: `f${i}`,
      date,
      meal: 'lunch' as const,
      time: at(date, '12:00'),
      foodId: 'x',
      name: 'x',
      grams: 100,
      nutrients: { kcal, protein, carbs: 0, fat: 0 },
    })),
    water: [
      { ...meta, id: 'a', date: '2026-01-10', time: 0, ml: 2000 },
      { ...meta, id: 'b', date: '2026-01-10', time: 0, ml: 1500 },
      { ...meta, id: 'c', date: '2026-01-11', time: 0, ml: 1000 },
    ],
    journal: [
      { ...meta, id: '2025-12-31', text: 'Fim de ano', mood: 5 },
      { ...meta, id: '2026-03-01', text: 'Bom dia', mood: 4 },
      { ...meta, id: '2026-03-02', text: '', mood: 2 },
    ],
    pains: [
      { ...meta, id: 'p1', name: 'canela', start: '2026-02-01', end: '2026-02-10', scores: {} },
      { ...meta, id: 'p2', name: 'joelho', start: '2025-12-20', scores: {} },
      { ...meta, id: 'p3', name: 'ombro', start: '2025-01-01', end: '2025-02-01', scores: {} },
    ],
    settings: {
      waterGoalMl: 3000,
      measurementSites: DEFAULT_MEASUREMENT_SITES,
      nutrition: { normal: { kcal: 2100, protein: 140, carbs: 200, fat: 70 }, training: { kcal: 2400, protein: 160, carbs: 250, fat: 70 } },
    },
  }
}

describe('the year to show', () => {
  it('runs to today in the current year, and opens on the last one in January', () => {
    expect(yearBounds(2026, today)).toEqual({ from: '2026-01-01', to: today, partial: true })
    expect(yearBounds(2025, today)).toEqual({ from: '2025-01-01', to: '2025-12-31', partial: false })
    expect(defaultYear(today, [2025, 2026])).toBe(2026)
    expect(defaultYear('2027-01-20', [2025, 2026, 2027])).toBe(2026)
    expect(defaultYear('2027-01-20', [2027])).toBe(2027)
    expect(recapYears('2025-04-16', today)).toEqual([2025, 2026])
    expect(recapYears(undefined, today)).toEqual([2026])
  })

  it('has the Hoje banner from December 1 to January 15', () => {
    expect(recapBannerYear('2026-11-30')).toBeUndefined()
    expect(recapBannerYear('2026-12-01')).toBe(2026)
    expect(recapBannerYear('2027-01-15')).toBe(2026)
    expect(recapBannerYear('2027-01-16')).toBeUndefined()
  })
})

describe('looksLikeRace', () => {
  it('tells races from the coach workouts and the watch names', () => {
    expect(looksLikeRace('Rústica de Morungava 2026 (6 a 8km)')).toBe(true)
    expect(looksLikeRace('Meia Maratona de Porto Alegre')).toBe(true)
    expect(looksLikeRace('São Silvestre 15K')).toBe(true)
    expect(looksLikeRace('Corrida 7 Km')).toBe(false)
    expect(looksLikeRace('Corrida Intervalado ativo 4,48 - 4,97 Km')).toBe(false)
    expect(looksLikeRace('06/11 Sex - Corrida 7 Km')).toBe(false)
    expect(looksLikeRace('Gravataí Corrida')).toBe(false)
    expect(looksLikeRace(undefined)).toBe(false)
  })
})

describe('buildRecap', () => {
  const recap = buildRecap(2026, today, sources())

  it('counts the training days month by month and the time trained', () => {
    expect(recap.trainingDays).toBe(9)
    expect(recap.months.map((month) => month.days)).toEqual([0, 1, 1, 2, 1, 1, 1, 1, 0, 1, 0, 0])
    expect(recap.months[10]).toMatchObject({ length: 30, future: false })
    expect(recap.months[11].future).toBe(true)
    // The watch's time, plus the two gym workouts it didn't record.
    expect(recap.trainingSeconds).toBe(24600 + 2 * 3600)
  })

  it('sums the running, with its longest run, fastest pace, records and races', () => {
    const run = recap.running!
    expect(run).toMatchObject({ runs: 4, seconds: 7800 })
    expect(run.km).toBeCloseTo(25.7)
    expect(run.longest).toEqual({ km: 10.5, date: '2026-05-01', activityId: 'r2' })
    expect(run.fastest).toMatchObject({ date: '2026-03-10', activityId: 'r1' })
    expect(run.fastest!.secondsPerKm).toBeCloseTo(1500 / 5.2)
    expect(run.bests.map(({ short, record, date }) => [short, record, date])).toEqual([
      ['1 km', true, '2026-03-10'],
      ['5 km', true, '2026-03-10'],
      ['10 km', true, '2026-05-01'],
    ])
    expect(run.bests[1].seconds).toBeCloseTo(5000 / (5200 / 1500))
    expect(run.races).toEqual([{ title: 'Rústica de Morungava 2026 (6 a 8km)', date: '2026-10-12', km: 7, seconds: 2100, activityId: 'race' }])
  })

  it('finds a race from the calendar on its day', () => {
    const withCalendar = { ...sources(), raceEvents: [{ title: 'Corrida da Mulher 10K', date: '2026-05-01' }] }
    expect(buildRecap(2026, today, withCalendar).running!.races.map((race) => race.title)).toEqual([
      'Corrida da Mulher 10K',
      'Rústica de Morungava 2026 (6 a 8km)',
    ])
  })

  it('does not count a best that an earlier year beat as a record', () => {
    const slow = sources()
    slow.activities = slow.activities.map((a) => (a.id === 'r2025' ? { ...a, timerSec: 1400 } : a))
    slow.streams.set('r2025', evenStream(5000, 1400))
    expect(buildRecap(2026, today, slow).running!.bests.find((best) => best.short === '5 km')!.record).toBe(false)
  })

  it('adds up the walks and the gym, with the most trained muscle and the biggest gains', () => {
    expect(recap.walking).toEqual({ walks: 2, km: 11, seconds: 13200 })
    const gym = recap.strength!
    expect(gym).toMatchObject({ sessions: 3, sets: 21, seconds: 3 * 3600 })
    expect(gym.volumeKg).toBe(3 * 600 + 4 * 640 + 3 * 560 + 4 * 500 + 3 * 600 + 4 * 550)
    expect(gym.topMuscle).toEqual({ muscle: 'quads', label: 'Quadríceps', sets: 12 })
    expect(gym.gains.map(({ name, fromKg, toKg }) => [name, Math.round(fromKg), Math.round(toKg)])).toEqual([
      ['Agachamento', 101, 128],
      ['Supino reto', 80, 95],
    ])
  })

  it('reads steps, sleep and the body', () => {
    expect(recap.steps).toEqual({ total: 40000, days: 3, average: 40000 / 3, best: { date: '2026-03-05', steps: 20000 } })
    expect(recap.sleep!.nights).toBe(18)
    expect(recap.sleep!.averageSec).toBeCloseTo(((10 * 7 + 8 * 8) / 18) * 3600)
    expect(recap.sleep!.averageScore).toBeCloseTo((10 * 70 + 8 * 85) / 18)
    expect(recap.sleep!.bestMonth).toMatchObject({ month: 6, averageScore: 85 })
    const body = recap.body!
    expect(body.weighIns).toBe(4)
    expect(body.start.date).toBe('2026-01-05')
    expect(body.end.date).toBe('2026-11-01')
    expect(body.end.kg).toBeLessThan(body.start.kg)
    expect(body.lowest).toEqual({ date: '2026-11-01', kg: 83 })
    expect(body.fat!.start).toBe(25)
    expect(body.fat!.end).toBeCloseTo(22)
    expect(body.measurements).toEqual([{ key: 'waist', label: 'Cintura', startCm: 90, endCm: 84 }])
  })

  it('rates the habits up to yesterday, skipped days left out, and finds their best runs', () => {
    const habits = recap.habits!
    expect(habits.list.map(({ name, best, unit }) => [name, best, unit])).toEqual([
      ['Álcool', 137, 'dias'],
      ['Creatina', 13, 'dias'],
      ['Correr', 2, 'semanas'],
    ])
    const rates = { Álcool: 155 / 157, Creatina: 13 / 307, Correr: 3 / 4 }
    for (const item of habits.list) expect(item.rate).toBeCloseTo(rates[item.name as keyof typeof rates])
    expect(habits.rate).toBeCloseTo((155 / 157 + 13 / 307 + 3 / 4) / 3)
  })

  it('sums food against each day goal, water, the diary and the pains', () => {
    expect(recap.food).toEqual({ days: 3, kcal: 2200, protein: 135, goalKcal: 2250, goalProtein: 150, onTarget: 2, withGoal: 2 })
    expect(recap.water).toEqual({ liters: 4.5, days: 2, goalDays: 1 })
    expect(recap.journal).toEqual({ days: 1, moodDays: 2, mood: 3 })
    expect(recap.pains).toEqual({ episodes: 2, names: ['joelho', 'canela'] })
  })

  it('picks the big numbers of the year and writes it all down', () => {
    expect(recap.highlights.map(({ value, label }) => `${value} ${label}`)).toEqual([
      '9 dias de treino',
      '25,7 km em 4 corridas',
      '3 treinos de musculação',
      '3 recordes pessoais na corrida',
      '9 h de treino',
      '40 mil passos',
    ])
    const text = recapText(recap).split('\n')
    expect(text[0]).toBe('Minha retrospectiva de 2026 (até 5/11)')
    expect(text[1]).toBe('• Treino: 9 dias; 8h50 no total')
    expect(text[2]).toBe(
      '• Corrida: 4 corridas, 25,7 km em 2h10; mais longa 10,5 km; ritmo mais rápido 4:48/km; recordes: 1 km 4:48, 5 km 24:02, 10 km 52:23; provas: Rústica de Morungava 2026 (6 a 8km) (12/10)',
    )
    expect(text).toContain('• Musculação: 3 treinos, 21 séries, 12 t levantadas; mais treinado: quadríceps; maiores ganhos: Agachamento 101→128 kg, Supino reto 80→95 kg')
    expect(text.at(-1)).toBe('• Dores: 2 episódios')
  })

  it('leaves out what a year has no data for', () => {
    const empty = buildRecap(2024, today, sources())
    expect(empty).toMatchObject({ trainingDays: 0, partial: false, highlights: [] })
    for (const key of ['running', 'walking', 'strength', 'steps', 'sleep', 'body', 'habits', 'food', 'water', 'journal', 'pains'] as const) {
      expect(empty[key]).toBeUndefined()
    }
    expect(recapText(empty)).toBe('Minha retrospectiva de 2024')
  })
})

describe('buildRecap with two years of data', () => {
  it('stays quick', () => {
    const days = dayRange('2025-01-01', today)
    const s = sources()
    s.activities = []
    s.streams = new Map()
    s.sessions = []
    s.health = []
    s.weights = []
    s.foodLogs = []
    s.water = []
    s.habitLogs = []
    s.habits = Array.from({ length: 10 }, (_, i) => habit(`h${i}`, { startDate: '2025-01-01' }))
    days.forEach((date, i) => {
      s.health.push({ ...meta, id: date, steps: 8000 + i, sleep: { totalSec: 7 * 3600, score: 70 + (i % 20) } })
      s.weights.push({ ...meta, id: `w${date}`, date, time: at(date), weightKg: 85 - i / 200, source: 'manual' })
      for (let meal = 0; meal < 5; meal++) {
        s.foodLogs.push({ ...meta, id: `f${date}${meal}`, date, meal: 'lunch', time: at(date), foodId: 'x', name: 'x', grams: 100, nutrients: { kcal: 450, protein: 30, carbs: 50, fat: 15 } })
      }
      for (let glass = 0; glass < 6; glass++) s.water.push({ ...meta, id: `a${date}${glass}`, date, time: 0, ml: 500 })
      for (const h of s.habits) if ((i + h.id.length) % 3) s.habitLogs.push(log(h.id, date))
      if (i % 2 === 0) {
        // A 6 km run every other day, with a sample every second.
        s.activities.push(activity(`r${date}`, date, { distanceM: 6000, timerSec: 1800 + (i % 60) }))
        s.streams.set(`r${date}`, evenStream(6000, 1800 + (i % 60)))
      } else if (i % 3 === 0) {
        s.sessions.push(session(`s${date}`, date, ['bench', 'squat', 'bench', 'squat', 'bench', 'squat'].map((id) => lift(id, sets(4, 60 + i / 10, 8)))))
      }
    })
    const started = performance.now()
    const recap = buildRecap(2026, today, s)
    const elapsed = performance.now() - started
    expect(recap.running!.runs).toBeGreaterThan(150)
    expect(recap.food!.days).toBe(dayRange('2026-01-01', today).length)
    expect(shiftDay(recap.from, -1)).toBe('2025-12-31')
    // Linear work: well under a second on a phone, with room for a busy test machine.
    expect(elapsed).toBeLessThan(2500)
  })
})
