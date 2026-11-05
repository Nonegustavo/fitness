import { useLiveQuery } from 'dexie-react-hooks'
import { Activity as ActivityIcon, Bike, Dumbbell, Footprints, HeartPulse, Mountain, Waves, type LucideIcon } from 'lucide-react'
import { alive, patch, remove } from '../../db/repo'
import { db } from '../../db/schema'
import type { Activity, ActivityStream, WorkoutSession } from '../../db/types'
import { formatDay } from '../../lib/dates'
import { formatClock, formatFixed } from '../../lib/format'
import { DISCOMFORT_AREAS } from '../training/discomfort'
import { checkSummary, checkWorkout } from './compliance'
import { weatherText } from './weather'

/** All activities, newest first. */
export function useActivities(): Activity[] | undefined {
  return useLiveQuery(async () => alive(await db.activities.orderBy('startTime').reverse().toArray()))
}

/** null = not found; undefined = still loading. */
export function useActivity(id: string): Activity | null | undefined {
  return useLiveQuery(async () => {
    const activity = await db.activities.get(id)
    return activity && !activity.deleted ? activity : null
  }, [id])
}

export function useActivityStream(id: string | undefined): ActivityStream | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.activityStreams.get(id)) ?? null) : null), [id])
}

export async function deleteActivity(id: string): Promise<void> {
  await remove(db.activities, id)
  await remove(db.activityStreams, id)
}

const SUB_SPORTS: Record<string, string> = {
  treadmill: 'Esteira',
  trail: 'Corrida em trilha',
  track: 'Corrida na pista',
  indoorRunning: 'Corrida indoor',
  indoorCycling: 'Bike indoor',
  spin: 'Spinning',
  mountain: 'Mountain bike',
  road: 'Ciclismo de estrada',
  gravelCycling: 'Gravel',
  strengthTraining: 'Musculação',
  cardioTraining: 'Cardio',
  hiit: 'HIIT',
  yoga: 'Yoga',
  pilates: 'Pilates',
  flexibilityTraining: 'Alongamento',
  breathing: 'Respiração',
  elliptical: 'Elíptico',
  stairClimbing: 'Escada',
  indoorRowing: 'Remo indoor',
  indoorWalking: 'Caminhada indoor',
  lapSwimming: 'Natação em piscina',
  openWater: 'Natação em águas abertas',
}

const SPORTS: Record<string, string> = {
  running: 'Corrida',
  cycling: 'Ciclismo',
  eBiking: 'Bike elétrica',
  walking: 'Caminhada',
  hiking: 'Trilha',
  swimming: 'Natação',
  training: 'Treino',
  fitnessEquipment: 'Aparelho',
  hiit: 'HIIT',
  rowing: 'Remo',
  paddling: 'Canoagem',
  kayaking: 'Caiaque',
  standUpPaddleboarding: 'Stand up paddle',
  surfing: 'Surfe',
  soccer: 'Futebol',
  basketball: 'Basquete',
  tennis: 'Tênis',
  racket: 'Esporte de raquete',
  boxing: 'Boxe',
  rockClimbing: 'Escalada',
  inlineSkating: 'Patins',
  mountaineering: 'Montanhismo',
  golf: 'Golfe',
  multisport: 'Multiesporte',
  meditation: 'Meditação',
}

/** What the user says about a workout after it: effort, discomfort and the comment. Syncs like the rest. */
export const saveActivityFeedback = (id: string, changes: Partial<Pick<Activity, 'effort' | 'discomfort' | 'notes'>>) =>
  patch(db.activities, id, changes)

/**
 * The feedback as a message to paste for the coach: the workout and its day, the comment, how the
 * planned steps went, the effort (PSE), where it hurt and the weather.
 */
export function coachMessage(
  activity: Pick<Activity, 'sport' | 'subSport' | 'title' | 'date' | 'notes' | 'effort' | 'discomfort'> &
    Partial<Pick<Activity, 'workout' | 'laps' | 'hrZones' | 'weather'>>,
): string {
  const lines = [`${activity.title ?? activityLabel(activity)} (${formatDay(activity.date, 'EEE, d/MM')})`]
  const notes = activity.notes?.trim()
  if (notes) lines.push(notes)
  const check = checkWorkout({ ...activity, laps: activity.laps ?? [] })
  // Laps that don't line up with the steps say nothing to the coach.
  if (check && check.status !== 'mismatch') {
    const summary = checkSummary(check)
    lines.push(summary.charAt(0).toUpperCase() + summary.slice(1))
  }
  if (activity.effort) lines.push(`Esforço (PSE): ${activity.effort}/10`)
  if (activity.discomfort?.length) {
    lines.push(`Desconforto: ${activity.discomfort.map((area) => DISCOMFORT_AREAS[area] ?? area).join(', ').toLowerCase()}`)
  }
  if (activity.weather) lines.push(`Clima: ${weatherText(activity.weather, { condition: true })}`)
  return lines.join('\n')
}

export function activityLabel(activity: Pick<Activity, 'sport' | 'subSport'>): string {
  return (activity.subSport && SUB_SPORTS[activity.subSport]) || SPORTS[activity.sport] || 'Atividade'
}

export function activityIcon(activity: Pick<Activity, 'sport' | 'subSport'>): LucideIcon {
  if (activity.subSport === 'strengthTraining') return Dumbbell
  switch (activity.sport) {
    case 'running':
    case 'walking':
      return Footprints
    case 'hiking':
    case 'mountaineering':
      return Mountain
    case 'cycling':
    case 'eBiking':
      return Bike
    case 'swimming':
    case 'rowing':
    case 'paddling':
    case 'kayaking':
      return Waves
    case 'training':
    case 'hiit':
      return HeartPulse
    default:
      return ActivityIcon
  }
}

/** Running and walking show pace (min/km), swimming min/100 m, everything else km/h. */
export type SpeedKind = 'pace' | 'swim' | 'speed'

export function speedKind(activity: Pick<Activity, 'sport'>): SpeedKind {
  if (activity.sport === 'running' || activity.sport === 'walking' || activity.sport === 'hiking') return 'pace'
  return activity.sport === 'swimming' ? 'swim' : 'speed'
}

/** 850 -> "850 m", 999.6 -> "1,00 km", 10021 -> "10,02 km". */
export const formatDistance = (meters: number): string =>
  Math.round(meters) < 1000 ? `${Math.round(meters)} m` : `${formatFixed(meters / 1000, 2)} km`

/** Seconds per km (or per 100 m when swimming); slower than this is standing still. */
export function paceSeconds(speed: number, kind: SpeedKind): number | null {
  if (speed < 0.3) return null
  return (kind === 'swim' ? 100 : 1000) / speed
}

/** m/s as the activity reads it: "5:32 /km", "2:05 /100 m" or "28,4 km/h". */
export function formatSpeed(speed: number, kind: SpeedKind): string {
  if (kind === 'speed') return `${formatFixed(speed * 3.6, 1)} km/h`
  const pace = paceSeconds(speed, kind)
  if (pace === null) return '—'
  return `${formatClock(pace)} ${kind === 'swim' ? '/100 m' : '/km'}`
}

/** "fr965" -> "Forerunner 965"; other names pass through. */
export function deviceName(device: string): string {
  const match = /^(fr|fenix|epix|venu|vivoactive|instinct|edge|enduro)(\d.*)$/i.exec(device)
  if (!match) return device
  const families: Record<string, string> = {
    fr: 'Forerunner',
    fenix: 'fēnix',
    epix: 'epix',
    venu: 'Venu',
    vivoactive: 'vívoactive',
    instinct: 'Instinct',
    edge: 'Edge',
    enduro: 'Enduro',
  }
  return `${families[match[1].toLowerCase()]} ${match[2]}`
}

const activityEnd = (activity: Activity) => activity.startTime + activity.elapsedSec * 1000

const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))

/** The time a workout and an activity share, when it covers at least half of the shorter one; else 0. */
function sameWorkout(session: WorkoutSession, activity: Activity): number {
  if (!session.endedAt) return 0
  const shared = overlap(session.startedAt, session.endedAt, activity.startTime, activityEnd(activity))
  const shorter = Math.min(session.endedAt - session.startedAt, activityEnd(activity) - activity.startTime)
  return shared > 0 && shared >= shorter / 2 ? shared : 0
}

/** The watch activity recorded during a finished workout: the one sharing the most time with it. */
export function matchActivity(session: WorkoutSession, activities: Activity[]): Activity | undefined {
  let best: Activity | undefined
  let bestShared = 0
  for (const activity of activities) {
    const shared = sameWorkout(session, activity)
    if (shared > bestShared) {
      best = activity
      bestShared = shared
    }
  }
  return best
}

/** The app workout done during an activity, if any. */
export function matchSession(activity: Activity, sessions: WorkoutSession[]): WorkoutSession | undefined {
  let best: WorkoutSession | undefined
  let bestShared = 0
  for (const session of sessions) {
    const shared = sameWorkout(session, activity)
    if (shared > bestShared) {
      best = session
      bestShared = shared
    }
  }
  return best
}

/** Activities that could overlap a workout, looked up by start time. */
export function useWorkoutActivity(session: WorkoutSession | null | undefined): Activity | undefined {
  return useLiveQuery(async () => {
    if (!session?.endedAt) return undefined
    const candidates = await db.activities
      .where('startTime')
      .between(session.startedAt - 6 * 3_600_000, session.endedAt, true, true)
      .toArray()
    return matchActivity(session, alive(candidates))
  }, [session?.id, session?.startedAt, session?.endedAt])
}

/** Heart rate at a moment, from the samples (null in a pause). */
export function heartRateAt(activity: Activity, stream: ActivityStream, time: number): number | null {
  const index = Math.round((time - activity.startTime) / 1000 / stream.step)
  return stream.hr?.[index] ?? null
}

/**
 * Peak heart rate of each done set: from the set's start (the watch's own detection when one ends
 * near the moment the set was checked, else 30 s before) to 15 s after, when the heart rate peaks.
 */
export function setPeakHeartRates(session: WorkoutSession, activity: Activity, stream: ActivityStream): Map<string, number> {
  const peaks = new Map<string, number>()
  const hr = stream.hr
  if (!hr) return peaks
  const index = (time: number) => Math.round((time - activity.startTime) / 1000 / stream.step)
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (!set.done || set.completedAt === undefined) continue
      const doneAt = set.completedAt
      const watchSet = activity.sets?.find(
        (candidate) => Math.abs(candidate.startTime + candidate.durationSec * 1000 - doneAt) <= 45_000,
      )
      const from = Math.max(0, index(watchSet ? watchSet.startTime : doneAt - 30_000))
      const to = Math.min(hr.length - 1, index(doneAt + 15_000))
      let peak: number | undefined
      for (let i = from; i <= to; i++) {
        const value = hr[i]
        if (value !== null && value !== undefined && (peak === undefined || value > peak)) peak = value
      }
      if (peak !== undefined) peaks.set(set.key, peak)
    }
  }
  return peaks
}
