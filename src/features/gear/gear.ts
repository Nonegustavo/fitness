import { useLiveQuery } from 'dexie-react-hooks'
import { notifyLocalChange } from '../../db/events'
import { alive, patch, remove, save, type Draft } from '../../db/repo'
import { db } from '../../db/schema'
import type { Activity, Gear } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { activityKind } from '../calendar/agenda'

/** What a pair of shoes is worn for: runs, or walks (hikes included). */
export type GearUse = 'run' | 'walk'

export const GEAR_USES: { use: GearUse; label: string; plural: string }[] = [
  { use: 'run', label: 'Corridas', plural: 'corridas' },
  { use: 'walk', label: 'Caminhadas', plural: 'caminhadas' },
]

/** When to replace a pair, unless the user says otherwise. */
export const DEFAULT_LIMIT_KM = 700
/** From this share of the limit on, the app says it's time to think about new shoes. */
export const WARN_SHARE = 0.9

export function gearUse(activity: Pick<Activity, 'sport' | 'subSport'>): GearUse | undefined {
  const kind = activityKind(activity)
  return kind === 'run' || kind === 'walk' ? kind : undefined
}

export interface GearStatus {
  gear: Gear
  /** What it had when added plus the activities done in it. */
  km: number
  limitKm: number
  /** The share of the limit used (past 1 when over it). */
  share: number
  /** At 90% of the limit or past it. */
  warn: boolean
  activities: number
}

/** Each pair with its kilometers, from the activities that used it. */
export function gearStatus(gear: Gear[], activities: Activity[]): GearStatus[] {
  const used = new Map<string, { meters: number; count: number }>()
  for (const activity of activities) {
    if (activity.deleted || !activity.gearId) continue
    const sum = used.get(activity.gearId) ?? { meters: 0, count: 0 }
    sum.meters += activity.distanceM ?? 0
    sum.count += 1
    used.set(activity.gearId, sum)
  }
  return gear
    .filter((item) => !item.deleted)
    .map((item) => {
      const sum = used.get(item.id)
      const km = (item.startKm ?? 0) + (sum?.meters ?? 0) / 1000
      const limitKm = item.limitKm || DEFAULT_LIMIT_KM
      const share = km / limitKm
      return { gear: item, km, limitKm, share, warn: share >= WARN_SHARE, activities: sum?.count ?? 0 }
    })
}

/**
 * The pair a new activity gets: the one in use marked as the default for its kind, if it was
 * already in use on that day (an old run brought from Garmin keeps no shoes rather than today's).
 */
export function defaultGear(gear: Gear[], activity: Pick<Activity, 'sport' | 'subSport' | 'date'>): Gear | undefined {
  const use = gearUse(activity)
  if (!use) return undefined
  return gear
    .filter((item) => !item.deleted && !item.retired && item.defaultFor?.includes(use) && (!item.since || item.since <= activity.date))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

/** The activities of these kinds since a day that have no shoes yet, which a new pair can take. */
export function withoutGear(activities: Activity[], uses: GearUse[], since: DayKey): Activity[] {
  return activities.filter((activity) => {
    const use = gearUse(activity)
    return !activity.deleted && !activity.gearId && activity.date >= since && use !== undefined && uses.includes(use)
  })
}

// ---------------------------------------------------------------- storage

/** Every pair, retired ones included. */
export const useGear = (): Gear[] | undefined => useLiveQuery(async () => alive(await db.gear.toArray()))

export type GearDraft = Draft<Gear>

/** Saves a pair; being the default for runs or walks takes that from the other pairs. */
export async function saveGear(draft: GearDraft): Promise<Gear> {
  const defaults = draft.retired ? [] : (draft.defaultFor ?? [])
  const row = await save(db.gear, { ...draft, defaultFor: defaults.length > 0 ? defaults : undefined })
  for (const other of alive(await db.gear.toArray())) {
    if (other.id === row.id || !other.defaultFor?.some((use) => defaults.includes(use as GearUse))) continue
    const rest = other.defaultFor.filter((use) => !defaults.includes(use as GearUse))
    await patch(db.gear, other.id, { defaultFor: rest.length > 0 ? rest : undefined })
  }
  return row
}

/** Retires a pair (it stops being anyone's default) or puts it back in use. */
export const setRetired = (id: string, retired: boolean) =>
  patch(db.gear, id, retired ? { retired: 1, defaultFor: undefined } : { retired: 0 })

/** Deletes a pair; the activities done in it go back to having none (and can take another pair). */
export async function deleteGear(id: string): Promise<void> {
  const worn = alive(await db.activities.toArray()).filter((activity) => activity.gearId === id)
  const now = Date.now()
  await db.transaction('rw', db.activities, async () => {
    for (const activity of worn) await db.activities.update(activity.id, { gearId: undefined, updatedAt: now, dirty: 1 })
  })
  await remove(db.gear, id)
}

/** The shoes worn in an activity; undefined clears them. */
export const setActivityGear = (activityId: string, gearId: string | undefined) => patch(db.activities, activityId, { gearId })

/** Puts a pair on the activities of these kinds since a day that have none; resolves to how many. */
export async function fillGear(gearId: string, uses: GearUse[], since: DayKey): Promise<number> {
  const targets = withoutGear(alive(await db.activities.toArray()), uses, since)
  if (targets.length === 0) return 0
  const now = Date.now()
  await db.transaction('rw', db.activities, async () => {
    for (const activity of targets) await db.activities.update(activity.id, { gearId, updatedAt: now, dirty: 1 })
  })
  notifyLocalChange()
  return targets.length
}

/** The default pair for an activity being imported, if any. */
export async function defaultGearId(activity: Pick<Activity, 'sport' | 'subSport' | 'date'>): Promise<string | undefined> {
  if (!gearUse(activity)) return undefined
  return defaultGear(alive(await db.gear.toArray()), activity)?.id
}
