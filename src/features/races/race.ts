import type { Activity, Race } from '../../db/types'
import { dayTime, type DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { eventKey, eventTitle, isRace, raceRun } from '../calendar/agenda'
import type { PlannedEvent } from '../garmin/calendar'
import { raceDistance, type RaceDistance } from '../running/predict'

/** A race to show: one of the app's list, or one of the Garmin calendar not brought into it. */
export interface RaceView {
  key: string
  name: string
  date: DayKey
  /** When it starts (ms), when known. */
  time?: number
  distance?: RaceDistance
  goalSec?: number
  /** The app's race. */
  race?: Race
  /** The Garmin calendar's race, for one not brought into the list. */
  event?: PlannedEvent
}

/** The race's distance for the predictions: one length, or a range by its middle. */
export function raceDistanceOf(race: Pick<Race, 'distanceM' | 'rangeM'>): RaceDistance | undefined {
  if (race.rangeM) return { meters: (race.rangeM[0] + race.rangeM[1]) / 2, range: race.rangeM }
  return race.distanceM ? { meters: race.distanceM } : undefined
}

export const raceView = (race: Race): RaceView => ({
  key: `race-${race.id}`,
  name: race.name,
  date: race.date,
  time: race.time ? dayTime(race.date, race.time) : undefined,
  distance: raceDistanceOf(race),
  goalSec: race.goalSec,
  race,
})

export const eventRaceView = (event: PlannedEvent): RaceView => ({
  key: `event-${eventKey(event)}`,
  name: eventTitle(event.title),
  date: event.date,
  time: event.time,
  distance: raceDistance(event.title),
  event,
})

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Whether a race of the Garmin calendar is in the app's list: brought from it, or put with its name on its day. */
export function inList(event: PlannedEvent, races: Race[]): boolean {
  const key = eventKey(event)
  const name = plain(eventTitle(event.title))
  return races.some((race) => !race.deleted && (race.eventKey === key || (race.date === event.date && plain(race.name) === name)))
}

/** The Garmin calendar's races not in the app's list, in date order. */
export const garminRaces = (events: PlannedEvent[] | null, races: Race[]): PlannedEvent[] =>
  (events ?? [])
    .filter((event) => isRace(event) && !inList(event, races))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? 0) - (b.time ?? 0))

/**
 * The races from `today` on, soonest first: the app's, and the Garmin calendar's not brought in. With
 * the activities, an app race of today whose run is in is behind already.
 */
export function upcomingRaces(races: Race[], events: PlannedEvent[] | null, today: DayKey, activities?: Activity[]): RaceView[] {
  return [
    ...races.filter((race) => !race.deleted && race.date >= today && !(activities && raceDone(race, activities, today))).map(raceView),
    ...garminRaces(events, races)
      .filter((event) => event.date >= today)
      .map(eventRaceView),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? Infinity) - (b.time ?? Infinity))
}

export const nextRaceView = (races: Race[], events: PlannedEvent[] | null, today: DayKey, activities?: Activity[]): RaceView | undefined =>
  upcomingRaces(races, events, today, activities)[0]

/** A race brought from the Garmin calendar: its name without SisRUN's date, its distance from the name. */
export function raceFromEvent(event: PlannedEvent, time?: string): Omit<Race, 'id' | 'updatedAt' | 'deleted' | 'dirty'> {
  const distance = raceDistance(event.title)
  return {
    name: eventTitle(event.title),
    date: event.date,
    ...(time && { time }),
    ...(distance?.range ? { rangeM: distance.range } : distance ? { distanceM: Math.round(distance.meters * 10) / 10 } : {}),
    eventKey: eventKey(event),
  }
}

export interface RaceResult {
  run?: Activity
  /** The official time, else the watch's. */
  seconds?: number
  official: boolean
  meters?: number
  /** Seconds per km: by the race's distance when it has one, else by the watch's. */
  pace?: number
  /** Against the goal, in seconds: below zero when faster. */
  vsGoal?: number
}

export function raceResult(race: Race, activities: Activity[]): RaceResult {
  const run = raceRun(race, activities)
  const seconds = race.officialSec ?? run?.timerSec
  const meters = run?.distanceM
  const paceMeters = race.officialSec !== undefined && race.distanceM ? race.distanceM : meters
  return {
    run,
    seconds,
    official: race.officialSec !== undefined,
    meters,
    pace: seconds !== undefined && paceMeters ? seconds / (paceMeters / 1000) : undefined,
    vsGoal: seconds !== undefined && race.goalSec !== undefined ? seconds - race.goalSec : undefined,
  }
}

/** Whether a race is behind: its day passed, or its run is in. */
export const raceDone = (race: Race, activities: Activity[], today: DayKey): boolean =>
  race.date < today || (race.date === today && raceRun(race, activities) !== undefined)

const kmText = (meters: number) => formatNumber(meters / 1000, Number.isInteger(meters / 1000) ? 0 : 1)

/** "6 a 8 km", "21,1 km". */
export function distanceText(distance: RaceDistance | undefined): string | undefined {
  if (!distance) return undefined
  return distance.range ? `${kmText(distance.range[0])} a ${kmText(distance.range[1])} km` : `${kmText(distance.meters)} km`
}

/**
 * The distance as typed: "10", "21,1", "6 a 8" (km), "10k", "meia maratona". `{}` when left empty,
 * undefined when it can't be read.
 */
export function parseDistance(text: string): Pick<Race, 'distanceM' | 'rangeM'> | undefined {
  const typed = text.trim()
  if (!typed) return {}
  const found = raceDistance(/\d$/.test(typed) ? `${typed} km` : typed)
  if (!found || found.meters <= 0) return undefined
  return found.range ? { rangeM: found.range } : { distanceM: Math.round(found.meters * 10) / 10 }
}

/** What the distance field shows for a race: "10", "21,1", "6 a 8". */
export const distanceInput = (race: Pick<Race, 'distanceM' | 'rangeM'>): string =>
  distanceText(raceDistanceOf(race))?.replace(/ km$/, '') ?? ''

/** A time as typed: "38:25" (min:s), "1:45:30" (h:min:s) or whole minutes ("40"); undefined when it can't be read. */
export function parseClock(text: string): number | undefined {
  const parts = text.trim().split(':')
  if (parts.length > 3 || !parts.every((part) => /^\d+$/.test(part))) return undefined
  const [a, b, c] = parts.map(Number)
  if (parts.length === 1) return a > 0 ? a * 60 : undefined
  if (parts.length === 2) return b < 60 && a * 60 + b > 0 ? a * 60 + b : undefined
  return b < 60 && c < 60 && a * 3600 + b * 60 + c > 0 ? a * 3600 + b * 60 + c : undefined
}
