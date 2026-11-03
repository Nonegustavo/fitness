import { describe, expect, it } from 'vitest'
import type { Habit, HabitLog } from '../../db/types'
import { describeReminder, notificationId, plannedReminders } from './reminders'

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
