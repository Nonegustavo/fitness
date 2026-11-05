import { describe, expect, it } from 'vitest'
import { dayRange, weekStart } from './dates'
import {
  aggregate,
  aggregateNote,
  axisLabel,
  canGoBack,
  canGoForward,
  chartLabel,
  defaultChoice,
  groupByPeriod,
  parseChoice,
  periodEnd,
  periodGoals,
  periodStart,
  periodTitle,
  periodWindow,
  rangeLabel,
  shiftPeriod,
  shiftWindow,
  windowTitle,
  type PeriodChoice,
} from './periods'

// A Thursday.
const today = '2026-11-05'
const starts = (window: { buckets: { start: string }[] }) => window.buckets.map((bucket) => bucket.start)
const lengths = (day: number, week: number, month: number) => ({ day, week, month })

describe('periods', () => {
  it('start weeks on Sunday, as weekStart does', () => {
    expect(periodStart('week', '2026-11-05')).toBe('2026-11-01')
    expect(periodStart('week', '2026-11-01')).toBe('2026-11-01')
    expect(periodStart('week', '2026-10-31')).toBe('2026-10-25')
    for (const day of dayRange('2025-12-01', '2027-01-31')) expect(periodStart('week', day)).toBe(weekStart(day))
  })

  it('start months and years on their first day', () => {
    expect(periodStart('day', today)).toBe(today)
    expect(periodStart('month', today)).toBe('2026-11-01')
    expect(periodStart('year', today)).toBe('2026-01-01')
  })

  it('shift across month and year boundaries', () => {
    expect(shiftPeriod('day', '2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftPeriod('week', today, -1)).toBe('2026-10-25')
    expect(shiftPeriod('month', '2026-01-15', -1)).toBe('2025-12-01')
    expect(shiftPeriod('month', '2025-11-01', 3)).toBe('2026-02-01')
    expect(shiftPeriod('year', '2026-06-01', -2)).toBe('2024-01-01')
  })

  it('end on the Saturday, the last day of the month or the year', () => {
    expect(periodEnd('day', today)).toBe(today)
    expect(periodEnd('week', today)).toBe('2026-11-07')
    expect(periodEnd('month', '2026-02-01')).toBe('2026-02-28')
    expect(periodEnd('month', '2028-02-10')).toBe('2028-02-29')
    expect(periodEnd('year', '2026-03-03')).toBe('2026-12-31')
  })
})

describe('periodWindow', () => {
  it('shows the last 30 days by default', () => {
    const window = periodWindow(defaultChoice('day'), today)
    expect(window.buckets).toHaveLength(30)
    expect(window.from).toBe('2026-10-07')
    expect(window.to).toBe(today)
    expect(window.buckets.at(-1)).toEqual({ start: today, end: today })
  })

  it('shows the last 12 weeks, Sunday to Saturday, the current one up to today', () => {
    const window = periodWindow(defaultChoice('week'), today)
    expect(window.buckets).toHaveLength(12)
    expect(window.from).toBe('2026-08-16')
    expect(window.buckets.at(-1)).toEqual({ start: '2026-11-01', end: '2026-11-07' })
    expect(window.to).toBe(today)
  })

  it('shows the last 12 months', () => {
    const window = periodWindow(defaultChoice('month'), today)
    expect(window.buckets).toHaveLength(12)
    expect(window.from).toBe('2025-12-01')
    expect(window.buckets.at(-1)).toEqual({ start: '2026-11-01', end: '2026-11-30' })
    expect(window.to).toBe(today)
  })

  it('shows every year with data, and can not move', () => {
    const window = periodWindow(defaultChoice('year'), today, undefined, '2024-06-10')
    expect(starts(window)).toEqual(['2024-01-01', '2025-01-01', '2026-01-01'])
    expect(window.fixed).toBe(true)
    expect(canGoBack(window, '2024-06-10')).toBe(false)
    expect(canGoForward(window)).toBe(false)
    expect(starts(periodWindow(defaultChoice('year'), today))).toEqual(['2026-01-01'])
  })

  it('uses the length picked for each grain', () => {
    const choice: PeriodChoice = { grain: 'week', lengths: lengths(7, 26, 6) }
    expect(periodWindow(choice, today).buckets).toHaveLength(26)
    expect(periodWindow({ ...choice, grain: 'day' }, today).buckets).toHaveLength(7)
  })
})

describe('moving the window', () => {
  it('goes back a whole window and forward again, stopping at today', () => {
    const latest = periodWindow(defaultChoice('day'), today)
    expect(canGoForward(latest)).toBe(false)
    expect(shiftWindow(latest, 1)).toBe(today)

    const end = shiftWindow(latest, -1)
    expect(end).toBe('2026-10-06')
    const before = periodWindow(defaultChoice('day'), today, end)
    expect([before.from, before.to]).toEqual(['2026-09-07', '2026-10-06'])
    expect(canGoForward(before)).toBe(true)
    expect(shiftWindow(before, 1)).toBe(today)
  })

  it('never goes past today, even from a window that ends in between', () => {
    const window = periodWindow(defaultChoice('day'), today, '2026-10-20')
    expect(shiftWindow(window, 1)).toBe(today)
  })

  it('moves weeks and months by whole periods', () => {
    const weeks = periodWindow(defaultChoice('week'), today)
    const end = shiftWindow(weeks, -1)
    expect(end).toBe('2026-08-15')
    const before = periodWindow(defaultChoice('week'), today, end)
    expect([before.buckets[0].start, before.buckets.at(-1)!.start]).toEqual(['2026-05-24', '2026-08-09'])

    const months = periodWindow(defaultChoice('month'), today)
    const lastYear = periodWindow(defaultChoice('month'), today, shiftWindow(months, -1))
    expect([lastYear.from, lastYear.to]).toEqual(['2024-12-01', '2025-11-30'])
  })

  it('goes back only while there is data before the window', () => {
    const window = periodWindow(defaultChoice('day'), today)
    expect(canGoBack(window, '2026-10-07')).toBe(false)
    expect(canGoBack(window, '2026-10-06')).toBe(true)
    expect(canGoBack(window, undefined)).toBe(true)
  })

  it('keeps the moved end when the grain changes', () => {
    const window = periodWindow(defaultChoice('month'), today, '2026-06-30')
    expect(window.buckets.at(-1)!.start).toBe('2026-06-01')
    expect(window.from).toBe('2025-07-01')
  })
})

describe('a picked range', () => {
  const custom = { from: '2026-03-10', to: '2026-04-20' }

  it('shows its days, or the whole weeks and months that hold them', () => {
    const days = periodWindow({ ...defaultChoice('day'), custom }, today)
    expect(days.buckets).toHaveLength(42)
    expect([days.from, days.to]).toEqual(['2026-03-10', '2026-04-20'])

    const weeks = periodWindow({ ...defaultChoice('week'), custom }, today)
    expect(starts(weeks)).toEqual(['2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29', '2026-04-05', '2026-04-12', '2026-04-19'])
    expect(weeks.to).toBe('2026-04-25')

    const months = periodWindow({ ...defaultChoice('month'), custom }, today)
    expect(starts(months)).toEqual(['2026-03-01', '2026-04-01'])
    expect(months.to).toBe('2026-04-30')
  })

  it('moves by its own length, forward up to today', () => {
    const window = periodWindow({ ...defaultChoice('day'), custom }, today)
    expect(canGoForward(window)).toBe(true)
    const back = periodWindow({ ...defaultChoice('day'), custom }, today, shiftWindow(window, -1))
    expect([back.from, back.to]).toEqual(['2026-01-27', '2026-03-09'])
    const ahead = periodWindow({ ...defaultChoice('day'), custom }, today, shiftWindow(window, 1))
    expect([ahead.from, ahead.to]).toEqual(['2026-04-21', '2026-06-01'])

    const late = { ...defaultChoice('day'), custom: { from: '2026-09-01', to: '2026-10-31' } }
    const last = periodWindow(late, today, shiftWindow(periodWindow(late, today), 1))
    expect([last.from, last.to]).toEqual(['2026-09-06', today])
  })

  it('puts the dates in order and stops at today', () => {
    const reversed = periodWindow({ ...defaultChoice('day'), custom: { from: custom.to, to: custom.from } }, today)
    expect([reversed.from, reversed.to]).toEqual(['2026-03-10', '2026-04-20'])
    const ahead = periodWindow({ ...defaultChoice('day'), custom: { from: '2026-10-01', to: '2026-12-31' } }, today)
    expect([ahead.from, ahead.to, ahead.buckets.length]).toEqual(['2026-10-01', today, 36])
  })

  it('can be shown by year, and then moves by years', () => {
    const window = periodWindow({ ...defaultChoice('year'), custom: { from: '2025-03-01', to: '2025-08-31' } }, today)
    expect(starts(window)).toEqual(['2025-01-01'])
    expect(window.fixed).toBe(false)
    expect(shiftWindow(window, -1)).toBe('2024-12-31')
    expect(shiftWindow(window, 1)).toBe(today)
  })
})

describe('aggregate', () => {
  // The week of 25 Oct (Sunday) and the current one, from 1 Nov.
  const window = periodWindow({ grain: 'week', lengths: lengths(30, 2, 12) }, today)
  const values = [
    { date: '2026-10-24', value: 70 },
    { date: '2026-10-31', value: 80 },
    { date: '2026-11-01', value: 82 },
    { date: '2026-11-02', value: 84 },
    { date: '2026-11-06', value: 90 },
  ]

  it('splits the weeks between Saturday and Sunday and leaves out days outside the window', () => {
    expect(groupByPeriod(window, values, (value) => value.date).map((group) => group.map((value) => value.value))).toEqual([
      [80],
      [82, 84],
    ])
  })

  it('averages, adds up or keeps the best of each period', () => {
    expect(aggregate(window, values, 'mean').map((bucket) => bucket.value)).toEqual([80, 83])
    expect(aggregate(window, values, 'sum').map((bucket) => bucket.value)).toEqual([80, 166])
    expect(aggregate(window, values, 'max').map((bucket) => bucket.value)).toEqual([80, 84])
  })

  it('averages per day with data, adding up the entries of a day first', () => {
    const water = [
      { date: '2026-11-01', value: 300 },
      { date: '2026-11-01', value: 200 },
      { date: '2026-11-02', value: 1000 },
    ]
    const [empty, week] = aggregate(window, water, 'perDay')
    expect(empty).toEqual({ start: '2026-10-25', end: '2026-10-31', count: 0, days: 0 })
    expect(week).toMatchObject({ value: 750, count: 3, days: 2 })
    expect(aggregate(window, water, 'mean')[1].value).toBe(500)
    expect(aggregate(window, water, 'sum')[1].value).toBe(1500)
  })

  it('turns two years of daily data into days, weeks, months and years', () => {
    const days = dayRange('2024-11-06', today)
    const daily = days.map((date, i) => ({ date, value: i % 10 }))
    const all = { from: days[0], to: today }
    expect(aggregate(periodWindow({ ...defaultChoice('day'), custom: all }, today), daily, 'sum')).toHaveLength(730)
    const weeks = aggregate(periodWindow({ ...defaultChoice('week'), custom: all }, today), daily, 'sum')
    expect(weeks).toHaveLength(105)
    expect(weeks.reduce((total, week) => total + week.count, 0)).toBe(730)
    const months = aggregate(periodWindow({ ...defaultChoice('month'), custom: all }, today), daily, 'perDay')
    expect(months.map((month) => month.days).slice(0, 3)).toEqual([25, 31, 31])
    const years = aggregate(periodWindow(defaultChoice('year'), today, undefined, days[0]), daily, 'mean')
    expect(years.map((year) => year.count)).toEqual([56, 365, 309])
  })
})

describe('periodGoals', () => {
  const window = periodWindow({ grain: 'week', lengths: lengths(30, 2, 12) }, today)
  const goals = dayRange('2026-10-25', today).map((date) => ({ date, value: date === '2026-11-02' ? 2600 : 2000 }))

  it('averages the goals of the days with data, or of every day when none has any', () => {
    expect(periodGoals(window, goals, new Set(['2026-11-01', '2026-11-02']))).toEqual([2000, 2300])
    const none = periodGoals(window, goals, new Set())
    expect(none[0]).toBe(2000)
    expect(none[1]).toBeCloseTo((2000 * 4 + 2600) / 5)
  })
})

describe('labels', () => {
  it('name each period', () => {
    expect(periodTitle('day', today, today)).toBe('quinta, 5 de nov')
    expect(periodTitle('day', '2025-11-05', today)).toBe('quarta, 5 de nov de 2025')
    expect(periodTitle('week', '2026-11-01', today)).toBe('semana de 1/11')
    expect(periodTitle('week', '2025-12-28', today)).toBe('semana de 28/12/25')
    expect(periodTitle('month', '2026-11-01', today)).toBe('nov 2026')
    expect(periodTitle('year', '2026-01-01', today)).toBe('2026')
  })

  it('keep axis labels short, with the year on months only across years', () => {
    const months = periodWindow(defaultChoice('month'), today)
    expect(axisLabel(months, '2025-12-01')).toBe('dez/25')
    const thisYear = periodWindow({ grain: 'month', lengths: lengths(30, 12, 6) }, today)
    expect(axisLabel(thisYear, '2026-06-01')).toBe('jun')
    expect(axisLabel(periodWindow(defaultChoice('week'), today), '2026-11-01')).toBe('1/11')
  })

  it('describe the window', () => {
    const latest = periodWindow(defaultChoice('day'), today)
    expect(windowTitle(latest, false)).toEqual({ title: 'Últimos 30 dias', detail: '7 out – 5 nov' })
    expect(windowTitle(periodWindow(defaultChoice('week'), today), false).title).toBe('Últimas 12 semanas')
    const before = periodWindow(defaultChoice('day'), today, '2026-10-06')
    expect(windowTitle(before, false)).toEqual({ title: '7 set – 6 out', detail: '30 dias' })
    expect(windowTitle(latest, true)).toEqual({ title: '7 out – 5 nov', detail: '30 dias' })
    expect(rangeLabel(periodWindow(defaultChoice('month'), today))).toBe('dez 2025 – nov 2026')
    expect(rangeLabel(periodWindow(defaultChoice('day'), today, '2025-11-20'))).toBe('22 out – 20 nov 2025')
    const years = periodWindow(defaultChoice('year'), today, undefined, '2024-06-10')
    expect(windowTitle(years, false)).toEqual({ title: 'Todos os anos', detail: '2024 – 2026' })
    expect(chartLabel('Água bebida', latest)).toBe('Água bebida, dia a dia, 7 out – 5 nov')
  })

  it('say whether a value is an average, a total or a best', () => {
    const week = { start: '2026-11-01', end: '2026-11-07', value: 1, count: 3, days: 2 }
    expect(aggregateNote('mean', 'week', week, ['pesagem', 'pesagens'])).toBe('média de 3 pesagens')
    expect(aggregateNote('perDay', 'week', week)).toBe('média por dia · 2 dias')
    expect(aggregateNote('sum', 'month', { ...week, count: 1 }, ['corrida', 'corridas'])).toBe('total · 1 corrida')
    expect(aggregateNote('max', 'month', week)).toBe('melhor do mês')
    expect(aggregateNote('mean', 'day', week)).toBe('')
  })
})

describe('parseChoice', () => {
  const fallback = defaultChoice('day')

  it('keeps a valid remembered choice', () => {
    const saved = { grain: 'month', lengths: lengths(14, 26, 24), custom: { from: '2026-01-01', to: '2026-03-31' } }
    expect(parseChoice(JSON.parse(JSON.stringify(saved)), fallback)).toEqual(saved)
  })

  it('falls back on what no longer makes sense', () => {
    expect(parseChoice(null, fallback)).toEqual(fallback)
    expect(parseChoice('week', fallback)).toEqual(fallback)
    expect(parseChoice({ grain: 'hour', lengths: { day: 13, week: 26 }, custom: { from: 'ontem' } }, fallback)).toEqual({
      grain: 'day',
      lengths: lengths(30, 26, 12),
    })
  })
})
