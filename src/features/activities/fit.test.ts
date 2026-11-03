import { Encoder, Profile, type FieldValue, type Mesg } from '@garmin/fitsdk'
import { describe, expect, it } from 'vitest'
import { dayKey } from '../../lib/dates'
import { parseFit, simplifyTrack } from './fit'

const N = Profile.MesgNum
const START = Date.UTC(2026, 10, 3, 9, 0, 0)
const at = (seconds: number) => new Date(START + seconds * 1000)
const semicircles = (degrees: number) => Math.round((degrees * 2 ** 31) / 180)

// The SDK types enum fields as numbers, but the encoder also takes their names ('activity', 'running').
const write = (encoder: Encoder, mesgNum: number, fields: Record<string, FieldValue>) =>
  encoder.onMesg(mesgNum, fields as Mesg)

/** A 10-minute run with a one-minute pause (300–360 s), two laps and the watch's zone times. */
function encodeRun(): Uint8Array {
  const encoder = new Encoder()
  write(encoder, N.FILE_ID, { type: 'activity', manufacturer: 'garmin', product: 4315, serialNumber: 3456789012, timeCreated: at(0) })
  for (let t = 0; t < 600; t++) {
    if (t >= 300 && t < 360) continue
    const moving = t < 300 ? t : t - 60
    write(encoder, N.RECORD, {
      timestamp: at(t),
      heartRate: 120 + Math.floor(t / 10),
      enhancedSpeed: 3,
      distance: moving * 3,
      enhancedAltitude: 10 + t * 0.01,
      cadence: 85,
      fractionalCadence: 0.5,
      positionLat: semicircles(-29.75 + moving * 0.00003),
      positionLong: semicircles(-50.01),
    })
  }
  write(encoder, N.LAP, { messageIndex: 0, timestamp: at(300), startTime: at(0), totalElapsedTime: 300, totalTimerTime: 300, totalDistance: 900, avgHeartRate: 134, maxHeartRate: 149, sport: 'running' })
  write(encoder, N.LAP, { messageIndex: 1, timestamp: at(600), startTime: at(360), totalElapsedTime: 240, totalTimerTime: 240, totalDistance: 720, avgHeartRate: 167, maxHeartRate: 179, sport: 'running' })
  write(encoder, N.TIME_IN_ZONE, {
    timestamp: at(600),
    referenceMesg: 'session',
    referenceIndex: 0,
    timeInHrZone: [0, 60, 120, 180, 120, 60],
    hrZoneHighBoundary: [96, 115, 134, 153, 172, 192],
  })
  write(encoder, N.SESSION, {
    messageIndex: 0,
    timestamp: at(600),
    startTime: at(0),
    totalElapsedTime: 600,
    totalTimerTime: 540,
    totalDistance: 1620,
    sport: 'running',
    subSport: 'street',
    avgHeartRate: 149,
    maxHeartRate: 179,
    totalCalories: 120,
    enhancedAvgSpeed: 3,
    avgCadence: 85,
    avgFractionalCadence: 0.5,
    totalAscent: 6,
  })
  write(encoder, N.ACTIVITY, { timestamp: at(600), numSessions: 1, type: 'manual' })
  return encoder.close()
}

describe('parseFit', () => {
  it('reads the summary, laps and zones of a run', () => {
    const { activity } = parseFit(encodeRun(), 'corrida.fit')
    expect(activity).toMatchObject({
      id: `fit-3456789012-${START / 1000}`,
      sport: 'running',
      subSport: 'street',
      date: dayKey(START),
      startTime: START,
      elapsedSec: 600,
      timerSec: 540,
      distanceM: 1620,
      avgHr: 149,
      maxHr: 179,
      calories: 120,
      // 85.5 strides per minute are 171 steps.
      avgCadence: 171,
      hasTrack: true,
      fileName: 'corrida.fit',
    })
    expect(activity.laps).toHaveLength(2)
    expect(activity.laps[1]).toMatchObject({ startTime: START + 360_000, timerSec: 240, distanceM: 720, avgHr: 167 })
    expect(activity.hrZones).toEqual({ seconds: [0, 60, 120, 180, 120, 60], limits: [96, 115, 134, 153, 172, 192] })
  })

  it('keeps one sample per second, carries short gaps and leaves pauses empty', () => {
    const { stream } = parseFit(encodeRun())
    expect(stream.step).toBe(1)
    expect(stream.hr).toHaveLength(601)
    expect(stream.hr?.[0]).toBe(120)
    expect(stream.hr?.[305]).toBe(149) // 6 s after the last sample: same value
    expect(stream.hr?.[330]).toBeNull() // inside the pause
    expect(stream.hr?.[360]).toBe(156)
    expect(stream.cadence?.[0]).toBe(171)
    expect(stream.distance?.[599]).toBe(1617)
    expect(stream.power).toBeUndefined()
  })

  it('simplifies a straight route to its ends', () => {
    const { stream } = parseFit(encodeRun())
    expect(stream.track).toEqual([
      [-29.75, -50.01],
      [-29.75 + 539 * 0.00003, -50.01].map((v) => Number(v.toFixed(5))),
    ])
  })

  it('keeps the active strength sets', () => {
    const encoder = new Encoder()
    write(encoder, N.FILE_ID, { type: 'activity', manufacturer: 'garmin', serialNumber: 1, timeCreated: at(0) })
    write(encoder, N.RECORD, { timestamp: at(0), heartRate: 90 })
    write(encoder, N.SET, { timestamp: at(40), startTime: at(10), duration: 30, repetitions: 10, weight: 40, setType: 'active' })
    write(encoder, N.SET, { timestamp: at(130), startTime: at(40), duration: 90, setType: 'rest' })
    write(encoder, N.SET, { timestamp: at(160), startTime: at(130), duration: 30, repetitions: 8, weight: 45, setType: 'active' })
    write(encoder, N.RECORD, { timestamp: at(200), heartRate: 140 })
    write(encoder, N.SESSION, { timestamp: at(200), startTime: at(0), totalElapsedTime: 200, totalTimerTime: 200, sport: 'training', subSport: 'strengthTraining' })
    const { activity, stream } = parseFit(encoder.close())

    expect(activity.subSport).toBe('strengthTraining')
    expect(activity.sets).toEqual([
      { startTime: START + 10_000, durationSec: 30, reps: 10, weightKg: 40 },
      { startTime: START + 130_000, durationSec: 30, reps: 8, weightKg: 45 },
    ])
    expect(activity.hasTrack).toBe(false)
    expect(stream.track).toBeUndefined()
  })

  it('computes zones from the samples when the watch did not', () => {
    const encoder = new Encoder()
    write(encoder, N.FILE_ID, { type: 'activity', manufacturer: 'garmin', serialNumber: 2, timeCreated: at(0) })
    write(encoder, N.ZONES_TARGET, { maxHeartRate: 200 })
    for (let t = 0; t < 100; t++) write(encoder, N.RECORD, { timestamp: at(t), heartRate: 150 })
    write(encoder, N.SESSION, { timestamp: at(99), startTime: at(0), totalElapsedTime: 99, totalTimerTime: 99, sport: 'running' })
    const { activity } = parseFit(encoder.close())

    expect(activity.hrZones).toEqual({ seconds: [0, 0, 0, 99, 0, 0], limits: [100, 120, 140, 160, 180, 200] })
  })

  it('rejects files that are not activities', () => {
    const encoder = new Encoder()
    write(encoder, N.FILE_ID, { type: 'course', manufacturer: 'garmin', serialNumber: 3, timeCreated: at(0) })
    expect(() => parseFit(encoder.close())).toThrow('não é de uma atividade')
    expect(() => parseFit(new Uint8Array(32).fill(7))).toThrow('Não é um arquivo .FIT')
  })
})

describe('simplifyTrack', () => {
  it('stays under the point budget on a winding route', () => {
    const zigzag = Array.from({ length: 5000 }, (_, i): [number, number] => [i * 0.0001, (i % 2) * 0.001])
    expect(simplifyTrack(zigzag, 1500).length).toBeLessThanOrEqual(1500)
  })
})
