import { useLiveQuery } from 'dexie-react-hooks'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import type { ActivityStream } from '../../db/types'
import { formatDay, parseDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatClock, formatNumber } from '../../lib/format'
import { distanceLabel, fitnessOf, predictRace, runEfforts, type RaceDistance, type RacePrediction, type RunFitness } from './predict'
import { isOutdoorRun } from './running'

/** The samples of some activities, by id. */
export async function streamsOf(ids: string[]): Promise<Map<string, ActivityStream>> {
  const streams = await db.activityStreams.bulkGet(ids)
  return new Map(streams.filter((stream): stream is ActivityStream => !!stream && !stream.deleted).map((stream) => [stream.id, stream]))
}

/** The running fitness from the outdoor runs of the 90 days up to `today`. */
async function recentFitness(today: DayKey): Promise<RunFitness> {
  const from = parseDay(shiftDay(today, -89)).getTime()
  const runs = alive(await db.activities.where('startTime').aboveOrEqual(from).toArray()).filter(isOutdoorRun)
  return fitnessOf(runEfforts(runs, await streamsOf(runs.map((run) => run.id))), today)
}

/** The running fitness as of `day` (the day before a race, for what was predicted for it); undefined while loading. */
export const useRecentFitness = (day: DayKey, enabled = true): RunFitness | null | undefined =>
  useLiveQuery(async () => (enabled ? recentFitness(day) : null), [day, enabled])

/** The time predicted for a race's distance; undefined while loading, without a distance or without recent runs. */
export function useRacePrediction(distance: RaceDistance | undefined, today: DayKey): RacePrediction | undefined {
  // Nothing to read for a race without a distance (or no race).
  const fitness = useRecentFitness(today, distance !== undefined)
  return fitness && distance ? predictRace(fitness, distance) : undefined
}

/** "~41:40": a prediction, not a time run. */
export const predicted = (seconds: number): string => `~${formatClock(seconds)}`

/** The race card's lines: the time predicted, for what distance, and from which run. */
export function RacePredictionLine({ distance, today }: { distance: RaceDistance | undefined; today: DayKey }) {
  const prediction = useRacePrediction(distance, today)
  if (!prediction) return null
  const { meters, seconds, ends, reference } = prediction
  return (
    <>
      <p className="mt-2 text-sm">
        <span className="font-medium">Previsão: {predicted(seconds)}</span>
        <span className="text-ink-2">
          {' '}
          para {distanceLabel(meters)}
          {ends &&
            `, o meio de ${formatNumber(ends[0].meters / 1000, 1)} a ${distanceLabel(ends[1].meters)} (${predicted(ends[0].seconds)} a ${predicted(ends[1].seconds)})`}
        </span>
      </p>
      <p className="text-xs text-muted">
        Pelo seu melhor trecho de {distanceLabel(reference.meters)} em 90 dias: {formatClock(reference.seconds)} em{' '}
        {formatDay(reference.date, 'd/MM')}.
      </p>
    </>
  )
}
