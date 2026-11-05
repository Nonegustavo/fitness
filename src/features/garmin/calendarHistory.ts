import { db } from '../../db/schema'
import { shiftDay, type DayKey } from '../../lib/dates'
import type { PlannedEvent } from './calendar'

/**
 * The published Garmin calendar only lists what is ahead: a day's workouts vanish once it passes.
 * This device keeps them here (local, not synced) for the weekly report to the coach, which tells
 * the runs planned and not done.
 */
const PAST_KEY = 'garminCalendarPast'
const KEEP_DAYS = 70

/**
 * What to keep after a new fetch: the days up to today that the previous fetch had and the new one
 * no longer has, on top of the ones kept before (a day's newest list wins); older than 70 days goes.
 */
export function keptEvents(kept: PlannedEvent[], previous: PlannedEvent[], current: PlannedEvent[], today: DayKey): PlannedEvent[] {
  const listed = new Set(current.map((event) => event.date))
  const vanished = previous.filter((event) => event.date <= today && !listed.has(event.date))
  const replaced = new Set(vanished.map((event) => event.date))
  const oldest = shiftDay(today, -KEEP_DAYS)
  return [...kept.filter((event) => !replaced.has(event.date)), ...vanished]
    .filter((event) => event.date >= oldest)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? 0) - (b.time ?? 0))
}

/** Called with each new fetch of the calendar, before it replaces the previous one. */
export async function keepPastEvents(previous: PlannedEvent[] | null, current: PlannedEvent[], today: DayKey): Promise<void> {
  const kept = await pastEvents()
  const next = keptEvents(kept, previous ?? [], current, today)
  if (next.length !== kept.length || next.some((event, i) => event !== kept[i])) await db.meta.put({ key: PAST_KEY, value: { events: next } })
}

export async function pastEvents(): Promise<PlannedEvent[]> {
  return ((await db.meta.get(PAST_KEY))?.value as { events?: PlannedEvent[] } | undefined)?.events ?? []
}

/** The calendar with the kept days: a day still listed in the calendar uses its list. */
export function withPastEvents(past: PlannedEvent[], current: PlannedEvent[] | null): PlannedEvent[] | null {
  if (past.length === 0) return current
  const listed = new Set((current ?? []).map((event) => event.date))
  return [...past.filter((event) => !listed.has(event.date)), ...(current ?? [])].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.time ?? 0) - (b.time ?? 0),
  )
}
