import type { ActivityStream } from '../../db/types'
import { REFERENCE_DISTANCES } from './predict'
import { bestEffort, RECORD_DISTANCES, type EffortLookup } from './running'

/**
 * The best stretches of every outdoor run, worked out once from its samples and kept on this device
 * (`db.meta`, not synced: it is derived data, each device computes its own). The records, the predictions
 * and the celebrations read it instead of loading every run's samples, megabytes that grow with each run.
 */

/** Meta key of the cache. */
export const EFFORTS_KEY = 'runEfforts'

/** Bumped when what an entry holds changes: an older cache is then worked out again. */
export const EFFORTS_VERSION = 1

/** Every distance some screen ranks: the records' and the predictions', shortest first. */
export const EFFORT_DISTANCES: readonly number[] = [
  ...new Set([...RECORD_DISTANCES.map((distance) => distance.meters), ...REFERENCE_DISTANCES]),
].sort((a, b) => a - b)

export interface RunEfforts {
  /** The `updatedAt` of the samples row the efforts came from. */
  su: number
  /** The best seconds over each distance the run reached, by meters ("5000", "21097.5"). */
  e: Record<string, number>
}

export interface EffortCache {
  v: number
  /** Every run with samples has its entry, from its current samples. */
  complete: boolean
  /** By activity id. A run whose samples haven't arrived has none (it isn't "a run without efforts"). */
  runs: Record<string, RunEfforts>
}

export const emptyCache = (): EffortCache => ({ v: EFFORTS_VERSION, complete: false, runs: {} })

/** The cache as stored, when it is of this version. */
export const validCache = (value: unknown): EffortCache | undefined => {
  const cache = value as Partial<EffortCache> | undefined
  return cache?.v === EFFORTS_VERSION && cache.runs && typeof cache.runs === 'object' ? (cache as EffortCache) : undefined
}

/** The best seconds over each distance in a run's samples; none for deleted samples. */
export function effortsOf(stream: Pick<ActivityStream, 'step' | 'distance' | 'deleted'>): Record<string, number> {
  const efforts: Record<string, number> = {}
  if (stream.deleted) return efforts
  for (const meters of EFFORT_DISTANCES) {
    const seconds = bestEffort(stream, meters)
    // The distances go up: a run that doesn't reach one doesn't reach the next.
    if (seconds === undefined) break
    efforts[String(meters)] = seconds
  }
  return efforts
}

/** A samples row's key in the `[id+updatedAt]` index. */
export type SampleKey = readonly [id: string, updatedAt: number]

export interface EffortPlan {
  /** Runs whose samples have no entry yet, or a newer row than the entry's. */
  compute: string[]
  /** Entries whose samples are gone or that are no longer an outdoor run. */
  drop: string[]
  /** Nothing to compute: the cache holds every run's current samples. */
  complete: boolean
}

/**
 * What to do to bring the cache up to date, from the samples' keys alone (no row loaded) and the ids of
 * the outdoor runs: compute what is missing or stale, drop what has no samples or no run any more.
 */
export function planEfforts(cache: EffortCache | undefined, keys: readonly SampleKey[], runIds: ReadonlySet<string>): EffortPlan {
  const runs = cache?.runs ?? {}
  const current = new Map<string, number>()
  for (const [id, updatedAt] of keys) if (runIds.has(id)) current.set(id, updatedAt)
  const compute = [...current].flatMap(([id, updatedAt]) => (runs[id]?.su === updatedAt ? [] : [id]))
  const drop = Object.keys(runs).filter((id) => !current.has(id))
  return { compute, drop, complete: compute.length === 0 }
}

/** The cache as a lookup for the records and predictions. */
export function cacheLookup(cache: EffortCache | undefined): EffortLookup {
  const runs = cache?.runs ?? {}
  return (activityId, meters) => runs[activityId]?.e[String(meters)]
}
