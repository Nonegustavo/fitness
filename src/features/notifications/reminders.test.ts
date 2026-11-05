import { describe, expect, it } from 'vitest'
import type { Habit, HabitLog } from '../../db/types'
import {
  describeReminder,
  leadText,
  nextWeeklyAt,
  notificationId,
  plannedReminders,
  plannedWorkoutReminders,
  summarizedWeek,
  weekDigest,
  weeklyMessage,
} from './reminders'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const habit = (changes: Partial<Habit> = {}): Habit => ({
  id: 'stretch',
  name: 'Alongar',
  kind: 'check',
  polarity: 'good',
  startDate: '2026-10-01',
  archived: 0,
  order: 0,
  reminder: { time: '20:00', days: [1, 3, 5] },
  ...meta,
  ...changes,
})
const everyDay = [0, 1, 2, 3, 4, 5, 6]
// Tuesday, 19:00.
const now = new Date(2026, 10, 3, 19, 0)

describe('plannedReminders', () => {
  it('covers the chosen weekdays at the chosen time for the next two weeks', () => {
    const planned = plannedReminders([habit()], [], now)
    expect(planned.map((reminder) => reminder.date)).toEqual([
      '2026-11-04',
      '2026-11-06',
      '2026-11-09',
      '2026-11-11',
      '2026-11-13',
      '2026-11-16',
    ])
    expect(planned[0].at).toEqual(new Date(2026, 10, 4, 20, 0))
    expect(planned[0]).toMatchObject({ title: 'Alongar', canCheck: true })
  })

  it('keeps tonight while it is ahead, and drops it once the habit is done', () => {
    const daily = habit({ reminder: { time: '20:00', days: everyDay } })
    const done: HabitLog = { id: 'stretch:2026-11-03', habitId: 'stretch', date: '2026-11-03', value: 1, ...meta }
    expect(plannedReminders([daily], [], now)[0].date).toBe('2026-11-03')
    expect(plannedReminders([daily], [done], now)[0].date).toBe('2026-11-04')
  })

  it('drops the reminder of a day skipped ("Hoje não vou fazer")', () => {
    const daily = habit({ reminder: { time: '20:00', days: everyDay } })
    const rain: HabitLog = { id: 'stretch:2026-11-03', habitId: 'stretch', date: '2026-11-03', value: 0, skipped: 1, note: 'chuva', ...meta }
    expect(plannedReminders([daily], [rain], now)[0].date).toBe('2026-11-04')
    // A skip undone (deleted) brings it back.
    expect(plannedReminders([daily], [{ ...rain, deleted: 1 }], now)[0].date).toBe('2026-11-03')
  })

  it('rings at the habit time, which the reminder follows', () => {
    const morning = habit({ time: '07:30', reminder: { time: '20:00', days: everyDay } })
    expect(plannedReminders([morning], [], now)[0].at).toEqual(new Date(2026, 10, 4, 7, 30))
  })

  it('waits for a count habit to reach its goal', () => {
    const water = habit({ kind: 'count', target: 8, reminder: { time: '20:00', days: everyDay } })
    const halfway: HabitLog = { id: 'stretch:2026-11-03', habitId: 'stretch', date: '2026-11-03', value: 4, ...meta }
    expect(plannedReminders([water], [halfway], now)[0]).toMatchObject({ date: '2026-11-03', canCheck: false })
  })

  it('leaves out archived habits, empty weekdays and times already gone', () => {
    expect(plannedReminders([habit({ archived: 1 })], [], now)).toEqual([])
    expect(plannedReminders([habit({ reminder: { time: '20:00', days: [] } })], [], now)).toEqual([])
    const tuesdayMorning = habit({ reminder: { time: '07:00', days: [2] } })
    expect(plannedReminders([tuesdayMorning], [], now).map((reminder) => reminder.date)).toEqual(['2026-11-10'])
  })
})

describe('notificationId', () => {
  it('is a stable 32-bit integer clear of the fixed ids', () => {
    const id = notificationId('stretch:2026-11-04')
    expect(id).toBe(notificationId('stretch:2026-11-04'))
    expect(id).not.toBe(notificationId('stretch:2026-11-05'))
    expect(id).toBeGreaterThanOrEqual(10_000)
    expect(id).toBeLessThan(2 ** 31)
  })
})

describe('describeReminder', () => {
  it('names the usual sets of days', () => {
    expect(describeReminder({ time: '20:30', days: everyDay })).toBe('Todo dia às 20:30')
    expect(describeReminder({ time: '07:00', days: [5, 1, 2, 3, 4] })).toBe('Seg a sex às 07:00')
    expect(describeReminder({ time: '10:00', days: [6, 0] })).toBe('Fim de semana às 10:00')
    expect(describeReminder({ time: '18:00', days: [4, 2] })).toBe('Ter, qui às 18:00')
  })
})

describe('plannedSmartReminders', () => {
  // Tuesday, 07:00.
  const morning = new Date(2026, 10, 3, 7, 0)
  const settings = { weighIn: '08:30', lunch: '14:00', dinner: '21:30', water: true }
  const empty = new Map()

  it('only reminds of what is missing that day', async () => {
    const { plannedSmartReminders } = await import('./reminders')
    const status = new Map([['2026-11-03', { weighed: true, meals: new Set(['lunch' as const]), waterMl: 0 }]])
    const today = plannedSmartReminders(settings, status, 3000, morning).filter((r) => r.date === '2026-11-03')
    expect(today.map((r) => `${r.kind} ${r.at.getHours()}`)).toEqual(['dinner 21', 'water 11', 'water 15', 'water 19'])
  })

  it('checks water against the pace of the day, with a glass of room', async () => {
    const { plannedSmartReminders, waterExpectedBy } = await import('./reminders')
    expect(waterExpectedBy(11, 3000)).toBe(800)
    const status = new Map([['2026-11-03', { weighed: false, meals: new Set<never>(), waterMl: 1400 }]])
    const water = plannedSmartReminders({ water: true }, status, 3000, morning).filter((r) => r.date === '2026-11-03')
    // 11h expects 800 ml and 15h 1600 ml (1400 is within a glass); only 19h (2400 ml) is still behind.
    expect(water.map((r) => r.at.getHours())).toEqual([19])
    expect(water[0].body).toContain('1,4 L de 3 L')
  })

  it('skips times already past, covers the next days, and does nothing when off', async () => {
    const { plannedSmartReminders, SMART_DAYS } = await import('./reminders')
    const noon = new Date(2026, 10, 3, 12, 0)
    const weighIns = plannedSmartReminders({ weighIn: '08:30' }, empty, 3000, noon)
    expect(weighIns[0].date).toBe('2026-11-04')
    expect(weighIns).toHaveLength(SMART_DAYS - 1)
    expect(weighIns[0].route).toBe('/corpo?novo=peso')
    expect(plannedSmartReminders(undefined, empty, 3000, noon)).toEqual([])
  })
})

describe('plannedWorkoutReminders', () => {
  const now = new Date(2026, 10, 4, 10, 0)
  const item = (changes: Partial<Parameters<typeof plannedWorkoutReminders>[0][number]> = {}) => ({
    key: 'plan-1',
    date: '2026-11-04',
    kind: 'gym' as const,
    title: 'Treino A',
    status: 'planned' as const,
    time: new Date(2026, 10, 4, 18, 0).getTime(),
    ...changes,
  })

  it('warns the chosen minutes before each workout with a time, gym to Hoje and runs to the calendar', () => {
    const run = item({ key: 'event-1', kind: 'run', title: 'Corrida 7 km', date: '2026-11-05', time: new Date(2026, 10, 5, 6, 30).getTime() })
    const [gym, morning] = plannedWorkoutReminders([item(), run], 30, now)
    expect(gym).toMatchObject({ title: 'Treino A às 18:00', body: 'Começa em 30 min. Toque para iniciar o treino.', route: '/' })
    expect(gym.at).toEqual(new Date(2026, 10, 4, 17, 30))
    expect(morning).toMatchObject({ title: 'Corrida 7 km às 06:30', route: '/calendario?dia=2026-11-05' })
    expect(morning.at).toEqual(new Date(2026, 10, 5, 6, 0))
  })

  it('warns of a walk too, opening its day on the calendar', () => {
    const walk = item({ key: 'plan-walk-2026-11-05', kind: 'walk', title: 'Caminhada de 40 min', date: '2026-11-05', time: new Date(2026, 10, 5, 7, 0).getTime() })
    expect(plannedWorkoutReminders([walk], 15, now)).toEqual([
      expect.objectContaining({
        title: 'Caminhada de 40 min às 07:00',
        body: 'Começa em 15 min. Toque para ver a caminhada.',
        route: '/calendario?dia=2026-11-05',
        at: new Date(2026, 10, 5, 6, 45),
      }),
    ])
  })

  it('skips workouts without a time, done, rest days, past heads-ups, and everything when off', () => {
    const skipped = [
      item({ time: undefined }),
      item({ status: 'done' }),
      item({ kind: 'rest' }),
      item({ time: new Date(2026, 10, 4, 10, 20).getTime() }),
    ]
    expect(plannedWorkoutReminders(skipped, 30, now)).toEqual([])
    expect(plannedWorkoutReminders([item()], undefined, now)).toEqual([])
  })

  it('gives a stable id per workout and time', () => {
    const [first] = plannedWorkoutReminders([item()], 30, now)
    const [again] = plannedWorkoutReminders([item()], 60, now)
    expect(first.id).toBe(again.id)
  })

  it('reads the lead time', () => {
    expect([15, 60, 90, 120].map(leadText)).toEqual(['15 min', '1 hora', '1 h 30', '2 horas'])
  })
})

describe('weekly summary', () => {
  it('goes out on the next Sunday at 20h, today when it is Sunday before 20h', () => {
    expect(nextWeeklyAt(new Date(2026, 10, 4, 10))).toEqual(new Date(2026, 10, 8, 20)) // Wednesday
    expect(nextWeeklyAt(new Date(2026, 10, 8, 9))).toEqual(new Date(2026, 10, 8, 20)) // Sunday morning
    expect(nextWeeklyAt(new Date(2026, 10, 8, 20, 30))).toEqual(new Date(2026, 10, 15, 20)) // Sunday night
  })

  it('is about the week that ended the day before', () => {
    expect(summarizedWeek(new Date(2026, 10, 8, 20))).toEqual({ from: '2026-11-01', to: '2026-11-07' })
  })

  it('counts the week: gym, runs, sleep and the days at the water goal', () => {
    const digest = weekDigest('2026-11-01', '2026-11-07', {
      sessions: [
        { date: '2026-11-02', endedAt: 1, deleted: 0 },
        { date: '2026-11-04', endedAt: 1, deleted: 0 },
        { date: '2026-11-05', endedAt: undefined, deleted: 0 },
        { date: '2026-10-31', endedAt: 1, deleted: 0 },
      ],
      activities: [
        { date: '2026-11-03', sport: 'running', distanceM: 7200, deleted: 0 },
        { date: '2026-11-06', sport: 'running', distanceM: 10300, deleted: 0 },
        { date: '2026-11-06', sport: 'walking', distanceM: 3000, deleted: 0 },
      ],
      health: [
        { id: '2026-11-02', sleep: { totalSec: 7 * 3600 } as never },
        { id: '2026-11-03', sleep: { totalSec: 8 * 3600 } as never },
        { id: '2026-11-04' },
      ],
      water: [
        { date: '2026-11-02', ml: 2000, deleted: 0 },
        { date: '2026-11-02', ml: 1000, deleted: 0 },
        { date: '2026-11-03', ml: 2500, deleted: 0 },
        { date: '2026-11-04', ml: 3000, deleted: 0 },
      ],
      waterGoalMl: 3000,
    })
    expect(digest).toEqual({ workouts: 2, runs: 2, runKm: 17.5, sleepHours: 7.5, waterDays: 2 })
    expect(weeklyMessage(digest)).toEqual({
      title: 'Resumo da semana',
      body: '2 treinos de força, 2 corridas (17,5 km), sono médio de 7,5 h e meta de água em 2 dias. Toque para ver a semana.',
    })
  })

  it('says only what happened, and invites to look when the numbers are not in yet', () => {
    expect(weeklyMessage({ workouts: 0, runs: 1, runKm: 5, waterDays: 0 }).body).toBe('1 corrida (5 km). Toque para ver a semana.')
    expect(weeklyMessage({ workouts: 0, runs: 0, runKm: 0, waterDays: 0 }).body).toMatch(/sem registros/)
    expect(weeklyMessage(undefined).body).toMatch(/Veja como foi a semana/)
  })
})
