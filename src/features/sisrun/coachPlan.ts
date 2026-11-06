import { FunctionsHttpError } from '@supabase/supabase-js'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import type { CoachWeek, CoachWorkout } from '../../../supabase/functions/sisrun/planilha'
import { db } from '../../db/schema'
import { dayKey, shiftDay, type DayKey } from '../../lib/dates'
import { getSyncState } from '../../sync/controller'
import { supabase } from '../../sync/supabase'

export type { CoachWeek, CoachWorkout }

/**
 * This device's copy of the coach's plan, read from SisRUN by the `sisrun` function. Local, like the
 * Garmin calendar: each device reads it on its own, with the Garmin sync.
 */
const META_KEY = 'sisrun'
/** Weeks kept after SisRUN stops sending them: the calendar's past days and the coach report use them. */
const KEEP_DAYS = 70
/** A pull to refresh this soon after the last read doesn't ask SisRUN again. */
const MIN_GAP_MS = 10 * 60_000

export interface CoachPlan {
  /** When the last read came. */
  fetchedAt?: number
  /** Each week's workouts, by its Monday. */
  weeks: Record<string, CoachWorkout[]>
  /** The last read's problem, until one works; `missing` when the secrets aren't set. */
  error?: { message: string; at: number; missing?: boolean }
}

/**
 * The plan after a read: each week that came replaces the one kept, unless it came without its
 * details (the structure would be lost); weeks that ended more than 70 days ago go.
 */
export function mergePlan(kept: CoachPlan, weeks: CoachWeek[], fetchedAt: number, today: DayKey): CoachPlan {
  const next: Record<string, CoachWorkout[]> = { ...kept.weeks }
  for (const week of weeks) {
    if (week.detailsMissing && next[week.start]?.length) continue
    next[week.start] = week.workouts
  }
  const oldest = shiftDay(today, -KEEP_DAYS)
  for (const start of Object.keys(next)) if (shiftDay(start, 6) < oldest) delete next[start]
  return { fetchedAt, weeks: next }
}

/** Every workout kept, by date. */
export const planWorkouts = (plan: CoachPlan | undefined): CoachWorkout[] =>
  Object.keys(plan?.weeks ?? {})
    .sort()
    .flatMap((start) => plan!.weeks[start])

export async function readPlan(): Promise<CoachPlan> {
  return ((await db.meta.get(META_KEY))?.value as CoachPlan | undefined) ?? { weeks: {} }
}

export const useCoachPlan = (): CoachPlan | undefined => useLiveQuery(readPlan)

/** The coach's workouts, for the calendar: none until SisRUN is set up. */
export function useCoachWorkouts(): CoachWorkout[] | undefined {
  const plan = useCoachPlan()
  return useMemo(() => (plan ? planWorkouts(plan) : undefined), [plan])
}

/** Whether SisRUN was ever read on this device, or its secrets are known to be missing. */
export const coachConfigured = (plan: CoachPlan | undefined): boolean => !!plan?.fetchedAt && !plan.error?.missing

/** A failed read; `missing` when the function says the secrets aren't set. */
class PlanError extends Error {
  constructor(
    message: string,
    readonly missing = false,
  ) {
    super(message)
  }
}

let running = false

/**
 * Reads the current week and the next one from SisRUN. Without `force`, a read less than 10 minutes
 * after the last one (or its failure) is skipped. Never throws: a failure is kept for Ajustes to show.
 */
export async function importCoachPlan({ force = false } = {}): Promise<void> {
  if (!supabase || !getSyncState().email || running) return
  const kept = await readPlan()
  const last = Math.max(kept.fetchedAt ?? 0, kept.error?.at ?? 0)
  if (!force && Date.now() - last < MIN_GAP_MS) return
  running = true
  try {
    const { data, error } = await supabase.functions.invoke('sisrun', { body: { weeksAhead: 1 } })
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: string; missing?: string } | null
      throw new PlanError(payload?.error ?? 'O SisRUN não respondeu.', payload?.missing === 'credentials')
    }
    if (error) throw new PlanError('Não foi possível falar com o servidor. Confira a internet.')
    const weeks = (data as { weeks?: CoachWeek[] } | null)?.weeks ?? []
    await db.meta.put({ key: META_KEY, value: mergePlan(await readPlan(), weeks, Date.now(), dayKey()) })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    const missing = cause instanceof PlanError && cause.missing
    await db.meta.put({ key: META_KEY, value: { ...(await readPlan()), error: { message, at: Date.now(), ...(missing && { missing }) } } })
  } finally {
    running = false
  }
}
