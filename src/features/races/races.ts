import { useLiveQuery } from 'dexie-react-hooks'
import { alive, patch, save, type Draft } from '../../db/repo'
import { db } from '../../db/schema'
import type { Race } from '../../db/types'
import { formatTime, type DayKey } from '../../lib/dates'
import { useActivities } from '../activities/activities'
import { eventKey } from '../calendar/agenda'
import type { PlannedEvent } from '../garmin/calendar'
import { pastEvents, withPastEvents } from '../garmin/calendarHistory'
import { plannedEvents, usePlannedEvents } from '../garmin/sync'
import { nextRaceView, raceFromEvent, type RaceView } from './race'

/** A race's run set to none: it wasn't run (the longest run of its day isn't it). */
export const NO_RUN = '-'

const byDate = (a: Race, b: Race) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99')

/** The app's races, by date. */
export const useRaces = (): Race[] | undefined => useLiveQuery(async () => alive(await db.races.toArray()).sort(byDate))

/** The Garmin calendar with its days kept after they passed (the last 70, on this device). */
export const useCalendarWithPast = (): PlannedEvent[] | null | undefined =>
  useLiveQuery(async () => withPastEvents(await pastEvents(), await plannedEvents()))

/**
 * The next race, the app's or the Garmin calendar's (one of today already run is behind); undefined
 * while loading, null with none.
 */
export function useNextRace(today: DayKey): RaceView | null | undefined {
  const races = useRaces()
  const events = usePlannedEvents()
  const activities = useActivities()
  if (races === undefined || events === undefined || activities === undefined) return undefined
  return nextRaceView(races, events, today, activities) ?? null
}

export const saveRace = (race: Draft<Race>): Promise<Race> => save(db.races, race)

/**
 * Brings a race of the Garmin calendar into the list, at the time set for it in the calendar (when
 * there is one), linked to `activityId` when given.
 */
export async function bringRace(event: PlannedEvent, activityId?: string): Promise<Race> {
  const set = await db.eventTimes.get(eventKey(event))
  const time = (set && !set.deleted && set.time) || (event.time !== undefined ? formatTime(event.time) : undefined)
  return save(db.races, { ...raceFromEvent(event, time), ...(activityId && { activityId }) })
}

export const linkRun = (race: Race, activityId: string): Promise<void> => patch(db.races, race.id, { activityId })
