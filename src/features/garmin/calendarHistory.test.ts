import { describe, expect, it } from 'vitest'
import type { PlannedEvent } from './calendar'
import { keptEvents, withPastEvents } from './calendarHistory'

const event = (date: string, title: string): PlannedEvent => ({ date, title })

describe('keeping the calendar days that passed', () => {
  const previous = [event('2026-11-03', 'Corrida 7 Km'), event('2026-11-04', 'Intervalado'), event('2026-11-06', 'Corrida 8 Km')]

  it('keeps the days the new fetch no longer lists, up to today', () => {
    const current = [event('2026-11-05', 'Rodagem'), event('2026-11-06', 'Corrida 8 Km')]
    const kept = keptEvents([event('2026-10-30', 'Longão')], previous, current, '2026-11-05')
    expect(kept.map((e) => `${e.date} ${e.title}`)).toEqual(['2026-10-30 Longão', '2026-11-03 Corrida 7 Km', '2026-11-04 Intervalado'])
  })

  it("replaces a day kept before with that day's newer list, and forgets what is over 70 days old", () => {
    const kept = keptEvents([event('2026-11-04', 'Velho'), event('2026-08-01', 'Antigo')], previous, [], '2026-11-05')
    expect(kept.map((e) => e.title)).toEqual(['Corrida 7 Km', 'Intervalado'])
  })

  it('adds the kept days to the calendar, which wins on the days it still lists', () => {
    const merged = withPastEvents([event('2026-11-03', 'Corrida 7 Km'), event('2026-11-05', 'Antes')], [event('2026-11-05', 'Rodagem')])
    expect(merged?.map((e) => e.title)).toEqual(['Corrida 7 Km', 'Rodagem'])
    expect(withPastEvents([], null)).toBeNull()
  })
})
