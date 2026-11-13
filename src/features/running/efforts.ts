import { liveQuery } from 'dexie'
import { useEffect, useMemo } from 'react'
import { alive } from '../../db/repo'
import { db, type FitnessDB } from '../../db/schema'
import { useShared } from '../../db/shared'
import {
  cacheLookup,
  EFFORTS_KEY,
  effortsOf,
  emptyCache,
  planEfforts,
  validCache,
  type EffortCache,
  type SampleKey,
} from './effortCache'
import { isOutdoorRun, type EffortLookup } from './running'

/** The app has just opened: the first screen comes first. */
const START_DELAY_MS = 3000
/** Samples rows loaded at a time (each up to ~60 kB), with a pause between them for the screens. */
const CHUNK = 4
const PAUSE_MS = 40

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, PAUSE_MS))

/** The cache as stored; undefined when there is none yet (or of an older version). */
export async function readEffortCache(database: FitnessDB = db): Promise<EffortCache | undefined> {
  return validCache((await database.meta.get(EFFORTS_KEY))?.value)
}

/** The cache as a lookup, for code that reads inside a query (in a liveQuery, it follows the cache). */
export const readEffortLookup = async (database: FitnessDB = db): Promise<EffortLookup> => cacheLookup(await readEffortCache(database))

/** What the filling compares: the samples' keys and the outdoor runs. */
export interface EffortInput {
  keys: SampleKey[]
  runIds: Set<string>
}

export async function readEffortInput(database: FitnessDB = db): Promise<EffortInput> {
  const [keys, activities] = await Promise.all([
    // Keys only: which samples changed, without loading any row.
    database.activityStreams.orderBy('[id+updatedAt]').keys() as unknown as Promise<SampleKey[]>,
    database.activities.toArray(),
  ])
  return { keys, runIds: new Set(alive(activities).filter(isOutdoorRun).map((run) => run.id)) }
}

/**
 * Brings the cache up to date: loads only the samples missing or newer than their entry, a few at a
 * time, writing the cache as it goes, and marks it complete when nothing is left. Returns whether it is.
 */
export async function fillEffortCache(input: EffortInput, database: FitnessDB = db, wait: () => Promise<void> = pause): Promise<boolean> {
  const stored = await readEffortCache(database)
  const plan = planEfforts(stored, input.keys, input.runIds)
  const cache: EffortCache = { ...(stored ?? emptyCache()), runs: { ...stored?.runs } }
  for (const id of plan.drop) delete cache.runs[id]
  const write = () => database.meta.put({ key: EFFORTS_KEY, value: cache })
  if (plan.complete) {
    cache.complete = true
    if (!stored?.complete || plan.drop.length > 0) await write()
    return true
  }
  cache.complete = false
  await write()
  for (let i = 0; i < plan.compute.length; i += CHUNK) {
    const rows = await database.activityStreams.bulkGet(plan.compute.slice(i, i + CHUNK))
    for (const row of rows) if (row) cache.runs[row.id] = { su: row.updatedAt, e: effortsOf(row) }
    await write()
    await wait()
  }
  cache.complete = true
  await write()
  return true
}

let started = false

/**
 * Keeps the cache up to date in the background, from a few seconds after the first call: whenever
 * samples or activities change, it fills what changed (one pass at a time, the latest change last).
 */
export function startEffortCache(): void {
  if (started) return
  started = true
  let running = false
  let next: EffortInput | undefined
  const run = async () => {
    if (running) return
    running = true
    while (next) {
      const input = next
      next = undefined
      try {
        await fillEffortCache(input)
      } catch (error) {
        console.warn('Cache dos recordes', error)
      }
    }
    running = false
  }
  setTimeout(() => {
    liveQuery(() => readEffortInput()).subscribe({
      next: (input) => {
        next = input
        void run()
      },
      error: (error) => console.warn('Cache dos recordes', error),
    })
  }, START_DELAY_MS)
}

export interface RunEffortsState {
  lookup: EffortLookup
  /** Every run with samples is in: the records are final, not filling in. */
  complete: boolean
}

/** The best stretches of the runs, from the cache (which it starts); undefined while loading. */
export function useRunEfforts(): RunEffortsState | undefined {
  useEffect(startEffortCache, [])
  const cache = useShared(EFFORTS_KEY, async () => (await readEffortCache()) ?? null)
  return useMemo(
    () => (cache === undefined ? undefined : { lookup: cacheLookup(cache ?? undefined), complete: cache?.complete ?? false }),
    [cache],
  )
}
