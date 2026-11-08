import { Decoder, Stream, type FitMessages, type RecordMesg, type SessionMesg } from '@garmin/fitsdk'
import type { Draft } from '../../db/repo'
import type { Activity, ActivityLap, ActivityStream, WatchSet } from '../../db/types'
import { dayKey } from '../../lib/dates'
import type { ActivityWindow } from '../garmin/edits'

export interface ParsedFit {
  activity: Draft<Activity> & { id: string }
  stream: Draft<ActivityStream> & { id: string }
}

/** Charts stay readable with ~1800 points; longer activities get a coarser step. */
const MAX_POINTS = 1800
/** Smart recording logs a sample every few seconds; a longer silence is a pause. */
const MAX_GAP_SEC = 10
const MAX_TRACK_POINTS = 1500
const SEMICIRCLE_TO_DEGREES = 180 / 2 ** 31

/** On foot the FIT cadence counts strides; watches show steps (twice as many). */
const FOOT_SPORTS = new Set(['running', 'walking', 'hiking'])

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const ms = (value: unknown): number | undefined => (value instanceof Date ? value.getTime() : undefined)

const round = (value: number | undefined, digits = 0): number | undefined =>
  value === undefined ? undefined : Number(value.toFixed(digits))

const name = (value: unknown): string | undefined =>
  value === undefined || value === null || value === 'generic' ? undefined : String(value)

const inside = (time: number, window: ActivityWindow) => time >= window.start && time <= window.end

/**
 * Reads a Garmin activity file into the app's activity and its downsampled samples. With `window`,
 * only that part of the recording, for an activity cut in Garmin Connect (its file still has all of
 * it): the samples, the route, the laps, the sets and the zones inside it, with totals worked out
 * from those samples.
 */
export function parseFit(bytes: Uint8Array, fileName?: string, window?: ActivityWindow): ParsedFit {
  const decoder = new Decoder(Stream.fromByteArray(bytes))
  if (!decoder.isFIT()) throw new Error('Não é um arquivo .FIT.')
  const { messages } = decoder.read()
  const fileId = messages.fileIdMesgs?.[0]
  if (fileId && String(fileId.type) !== 'activity') throw new Error('Este .FIT não é de uma atividade.')

  const session = messages.sessionMesgs?.[0]
  const recorded = (messages.recordMesgs ?? []).filter((record) => record.timestamp instanceof Date)
  const records = window ? recorded.filter((record) => inside(ms(record.timestamp)!, window)) : recorded
  const startTime = window?.start ?? ms(session?.startTime) ?? ms(records[0]?.timestamp) ?? ms(fileId?.timeCreated)
  if (startTime === undefined) throw new Error('O arquivo não tem dados da atividade.')
  const lastRecord = ms(records.at(-1)?.timestamp)
  const elapsedSec = window
    ? (window.end - window.start) / 1000
    : (num(session?.totalElapsedTime) ?? (lastRecord !== undefined ? (lastRecord - startTime) / 1000 : 0))

  const sport = name(session?.sport ?? messages.sportMesgs?.[0]?.sport) ?? 'generic'
  const foot = FOOT_SPORTS.has(sport)
  const cadence = (value: unknown, fraction: unknown) => {
    const whole = num(value)
    return whole === undefined ? undefined : Math.round((whole + (num(fraction) ?? 0)) * (foot ? 2 : 1))
  }

  // The serial number and creation time identify the file, so importing it again updates it.
  const created = ms(fileId?.timeCreated) ?? startTime
  const id = `fit-${num(fileId?.serialNumber) ?? 0}-${Math.round(created / 1000)}`
  const stream = buildStream(records, startTime, elapsedSec, foot, window !== undefined)

  const totals: Partial<Activity> = window
    ? cutTotals(records, session, elapsedSec, foot)
    : {
        elapsedSec: Math.round(elapsedSec),
        timerSec: Math.round(num(session?.totalTimerTime) ?? elapsedSec),
        distanceM: round(num(session?.totalDistance), 1),
        calories: num(session?.totalCalories),
        avgHr: num(session?.avgHeartRate),
        maxHr: num(session?.maxHeartRate),
        avgSpeed: round(num(session?.enhancedAvgSpeed) ?? num(session?.avgSpeed), 3),
        maxSpeed: round(num(session?.enhancedMaxSpeed) ?? num(session?.maxSpeed), 3),
        ascentM: num(session?.totalAscent),
        descentM: num(session?.totalDescent),
        avgCadence: cadence(session?.avgRunningCadence ?? session?.avgCadence, session?.avgFractionalCadence),
        avgPower: num(session?.avgPower),
        maxPower: num(session?.maxPower),
        normalizedPower: num(session?.normalizedPower),
      }

  return {
    activity: {
      id,
      sport,
      subSport: name(session?.subSport),
      date: dayKey(startTime),
      startTime,
      elapsedSec: Math.round(elapsedSec),
      timerSec: Math.round(elapsedSec),
      ...totals,
      aerobicEffect: round(num(session?.totalTrainingEffect), 1),
      anaerobicEffect: round(num(session?.totalAnaerobicTrainingEffect), 1),
      device: name(fileId?.productName ?? fileId?.garminProduct),
      laps: (messages.lapMesgs ?? []).flatMap((lap): ActivityLap[] => {
        const lapStart = ms(lap.startTime)
        const lapElapsed = num(lap.totalElapsedTime)
        if (lapStart === undefined || lapElapsed === undefined) return []
        const whole: ActivityLap = {
          startTime: lapStart,
          elapsedSec: round(lapElapsed, 1)!,
          timerSec: round(num(lap.totalTimerTime) ?? lapElapsed, 1)!,
          distanceM: round(num(lap.totalDistance), 1),
          avgHr: num(lap.avgHeartRate),
          maxHr: num(lap.maxHeartRate),
          avgSpeed: round(num(lap.enhancedAvgSpeed) ?? num(lap.avgSpeed), 3),
          avgCadence: cadence(lap.avgRunningCadence ?? lap.avgCadence, lap.avgFractionalCadence),
          avgPower: num(lap.avgPower),
          ascentM: num(lap.totalAscent),
          intensity: name(lap.intensity),
        }
        if (!window) return [whole]
        // A cut activity keeps the laps inside it, the ones it crosses cut at its edges.
        const lapEnd = lapStart + lapElapsed * 1000
        const kept = { start: Math.max(lapStart, window.start), end: Math.min(lapEnd, window.end) }
        if (kept.end - kept.start < 1000) return []
        if (kept.start === lapStart && kept.end === lapEnd) return [whole]
        return [cutLap(whole, kept, records, foot)]
      }),
      hrZones: heartRateZones(messages, records, window !== undefined),
      sets: watchSets(messages, window),
      hasTrack: stream.track !== undefined,
      fileName,
    },
    stream: { id, ...stream },
  }
}

/** What the samples of a stretch add up to: its time without the pauses, its distance, its averages. */
interface Stretch {
  seconds: number
  distance?: number
  avgHr?: number
  maxHr?: number
  maxSpeed?: number
  avgCadence?: number
  avgPower?: number
  maxPower?: number
}

const mean = (values: number[]) => (values.length > 0 ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : undefined)
const highest = (values: number[]) => (values.length > 0 ? Math.max(...values) : undefined)

function stretch(records: RecordMesg[], foot: boolean): Stretch {
  let seconds = 0
  const hr: number[] = []
  const speed: number[] = []
  const cadence: number[] = []
  const power: number[] = []
  const distance: number[] = []
  records.forEach((record, i) => {
    const next = records[i + 1]
    // A longer silence between samples is a pause.
    if (next) {
      const gap = (ms(next.timestamp)! - ms(record.timestamp)!) / 1000
      if (gap <= MAX_GAP_SEC) seconds += gap
    }
    const beats = num(record.heartRate)
    if (beats !== undefined) hr.push(beats)
    const pace = num(record.enhancedSpeed) ?? num(record.speed)
    if (pace !== undefined) speed.push(pace)
    const strides = num(record.cadence)
    if (strides) cadence.push((strides + (num(record.fractionalCadence) ?? 0)) * (foot ? 2 : 1))
    const watts = num(record.power)
    if (watts !== undefined) power.push(watts)
    const meters = num(record.distance)
    if (meters !== undefined) distance.push(meters)
  })
  return {
    seconds,
    distance: distance.length > 1 ? distance.at(-1)! - distance[0] : undefined,
    avgHr: mean(hr),
    maxHr: highest(hr),
    maxSpeed: highest(speed),
    avgCadence: mean(cadence),
    avgPower: mean(power),
    maxPower: highest(power),
  }
}

/**
 * The totals of a cut activity, from its samples. The calories are the watch's, in proportion to the
 * time kept; the climb is left out, as the watch's own was for the whole recording.
 */
function cutTotals(records: RecordMesg[], session: SessionMesg | undefined, elapsedSec: number, foot: boolean): Partial<Activity> {
  const part = stretch(records, foot)
  const watchTimer = num(session?.totalTimerTime)
  const watchCalories = num(session?.totalCalories)
  return {
    elapsedSec: Math.round(elapsedSec),
    timerSec: Math.round(Math.min(part.seconds, elapsedSec)),
    distanceM: round(part.distance, 1),
    calories: watchCalories !== undefined && watchTimer ? Math.round(watchCalories * Math.min(1, part.seconds / watchTimer)) : undefined,
    avgHr: part.avgHr,
    maxHr: part.maxHr,
    avgSpeed: part.distance !== undefined && part.seconds > 0 ? round(part.distance / part.seconds, 3) : undefined,
    maxSpeed: round(part.maxSpeed, 3),
    avgCadence: part.avgCadence,
    avgPower: part.avgPower,
    maxPower: part.maxPower,
  }
}

/** A lap crossing the edge of a cut activity: the part of it that stays, from its samples. */
function cutLap(lap: ActivityLap, kept: ActivityWindow, records: RecordMesg[], foot: boolean): ActivityLap {
  const elapsed = (kept.end - kept.start) / 1000
  const part = stretch(
    records.filter((record) => inside(ms(record.timestamp)!, kept)),
    foot,
  )
  return {
    startTime: kept.start,
    elapsedSec: round(elapsed, 1)!,
    timerSec: round(Math.min(part.seconds, elapsed), 1)!,
    distanceM: round(part.distance, 1),
    avgHr: part.avgHr,
    maxHr: part.maxHr,
    avgSpeed: part.distance !== undefined && part.seconds > 0 ? round(part.distance / part.seconds, 3) : undefined,
    avgCadence: part.avgCadence,
    avgPower: part.avgPower,
    intensity: lap.intensity,
  }
}

function watchSets(messages: FitMessages, window?: ActivityWindow): WatchSet[] | undefined {
  const sets = (messages.setMesgs ?? []).flatMap((set): WatchSet[] => {
    const start = ms(set.startTime)
    const duration = num(set.duration)
    if (String(set.setType) !== 'active' || start === undefined || duration === undefined) return []
    if (window && !inside(start, window)) return []
    return [{ startTime: start, durationSec: round(duration, 1)!, reps: num(set.repetitions), weightKg: round(num(set.weight), 1) }]
  })
  return sets.length > 0 ? sets : undefined
}

/**
 * Time below zone 1 and in zones 1–5, with each one's upper limit. The watch's own count when
 * the file has it; otherwise computed from the samples with Garmin's default zones (50–100% of max).
 * `recount` (a cut activity): from the samples kept, with the watch's limits when it has them.
 */
export function heartRateZones(
  messages: FitMessages,
  records: RecordMesg[],
  recount = false,
): { seconds: number[]; limits: number[] } | undefined {
  const watch = messages.timeInZoneMesgs?.find((mesg) => String(mesg.referenceMesg) === 'session')
  const watchSeconds = watch?.timeInHrZone
  const watchLimits = watch?.hrZoneHighBoundary
  if (!recount && watchSeconds && watchLimits && watchSeconds.length >= 6 && watchLimits.length >= 6) {
    return { seconds: watchSeconds.slice(0, 6).map((s) => Math.round(s)), limits: watchLimits.slice(0, 6) }
  }

  const maxHr = num(watch?.maxHeartRate) ?? num(messages.zonesTargetMesgs?.[0]?.maxHeartRate)
  const ownLimits = recount && watchLimits && watchLimits.length >= 6 ? watchLimits.slice(0, 6) : undefined
  if ((ownLimits === undefined && maxHr === undefined) || !records.some((record) => num(record.heartRate) !== undefined)) return undefined
  const limits = ownLimits ?? [0.5, 0.6, 0.7, 0.8, 0.9, 1].map((share) => Math.round(maxHr! * share))
  const seconds = [0, 0, 0, 0, 0, 0]
  for (let i = 0; i < records.length - 1; i++) {
    const hr = num(records[i].heartRate)
    if (hr === undefined) continue
    const gap = (ms(records[i + 1].timestamp)! - ms(records[i].timestamp)!) / 1000
    const zone = limits.findIndex((limit) => hr <= limit)
    seconds[zone === -1 ? 5 : zone] += Math.min(gap, MAX_GAP_SEC)
  }
  return { seconds: seconds.map((s) => Math.round(s)), limits }
}

/** Averages of the samples in each `step`-second slot; short gaps carry the last value forward. */
class Channel {
  private sums: Float64Array
  private counts: Uint16Array
  constructor(
    length: number,
    private digits: number,
    private keepLast = false,
  ) {
    this.sums = new Float64Array(length)
    this.counts = new Uint16Array(length)
  }

  add(index: number, value: number | undefined) {
    if (value === undefined) return
    if (this.keepLast) this.sums[index] = value
    else this.sums[index] += value
    this.counts[index] = this.keepLast ? 1 : this.counts[index] + 1
  }

  finish(maxGapSlots: number): (number | null)[] | undefined {
    const values: (number | null)[] = []
    let last: number | null = null
    let lastIndex = -Infinity
    let any = false
    for (let i = 0; i < this.sums.length; i++) {
      if (this.counts[i] > 0) {
        last = Number((this.sums[i] / this.counts[i]).toFixed(this.digits))
        lastIndex = i
        any = true
        values.push(last)
      } else {
        values.push(i - lastIndex <= maxGapSlots ? last : null)
      }
    }
    return any ? values : undefined
  }
}

/** `cut`: the samples of a cut activity, whose distance starts again from zero where it begins. */
function buildStream(
  records: RecordMesg[],
  start: number,
  elapsedSec: number,
  foot: boolean,
  cut = false,
): Omit<ActivityStream, 'id' | 'updatedAt' | 'deleted' | 'dirty'> {
  const base = cut ? (records.map((record) => num(record.distance)).find((meters) => meters !== undefined) ?? 0) : 0
  const step = Math.max(1, Math.ceil(elapsedSec / MAX_POINTS))
  const length = Math.max(1, Math.floor(elapsedSec / step) + 1)
  const hr = new Channel(length, 0)
  const speed = new Channel(length, 2)
  const altitude = new Channel(length, 1)
  const distance = new Channel(length, 0, true)
  const cadence = new Channel(length, 0)
  const power = new Channel(length, 0)
  const points: [number, number][] = []

  for (const record of records) {
    const offset = (ms(record.timestamp)! - start) / 1000
    if (offset < 0) continue
    const i = Math.min(length - 1, Math.floor(offset / step))
    hr.add(i, num(record.heartRate))
    speed.add(i, num(record.enhancedSpeed) ?? num(record.speed))
    altitude.add(i, num(record.enhancedAltitude) ?? num(record.altitude))
    const meters = num(record.distance)
    distance.add(i, meters === undefined ? undefined : meters - base)
    const strides = num(record.cadence)
    if (strides !== undefined) cadence.add(i, (strides + (num(record.fractionalCadence) ?? 0)) * (foot ? 2 : 1))
    power.add(i, num(record.power))
    const lat = num(record.positionLat)
    const lon = num(record.positionLong)
    if (lat !== undefined && lon !== undefined) points.push([lat * SEMICIRCLE_TO_DEGREES, lon * SEMICIRCLE_TO_DEGREES])
  }

  const gap = Math.floor(MAX_GAP_SEC / step)
  return {
    step,
    hr: hr.finish(gap),
    speed: speed.finish(gap),
    altitude: altitude.finish(gap),
    distance: distance.finish(gap),
    cadence: cadence.finish(gap),
    power: power.finish(gap),
    track:
      points.length > 1
        ? simplifyTrack(points, MAX_TRACK_POINTS).map(([lat, lon]) => [round(lat, 5)!, round(lon, 5)!])
        : undefined,
  }
}

/** Douglas–Peucker with a growing tolerance (from ~2 m) until the route fits in `maxPoints`. */
export function simplifyTrack(points: [number, number][], maxPoints: number): [number, number][] {
  let tolerance = 0.00002
  let result = douglasPeucker(points, tolerance)
  while (result.length > maxPoints) {
    tolerance *= 2
    result = douglasPeucker(points, tolerance)
  }
  return result
}

function douglasPeucker(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length < 3) return points
  // Degrees of longitude shrink away from the equator; scale them to match latitude.
  const scale = Math.cos((points[0][0] * Math.PI) / 180)
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const pending: [number, number][] = [[0, points.length - 1]]
  while (pending.length > 0) {
    const [first, last] = pending.pop()!
    let farthest = -1
    let max = tolerance
    for (let i = first + 1; i < last; i++) {
      const distance = segmentDistance(points[i], points[first], points[last], scale)
      if (distance > max) {
        max = distance
        farthest = i
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1
      pending.push([first, farthest], [farthest, last])
    }
  }
  return points.filter((_, i) => keep[i] === 1)
}

function segmentDistance(p: [number, number], a: [number, number], b: [number, number], scale: number): number {
  const [px, py] = [p[1] * scale, p[0]]
  const [ax, ay] = [a[1] * scale, a[0]]
  const [bx, by] = [b[1] * scale, b[0]]
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
