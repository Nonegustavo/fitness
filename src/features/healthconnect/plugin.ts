import { Capacitor, registerPlugin } from '@capacitor/core'

export type BodySampleType = 'weight' | 'bodyFat' | 'leanMass' | 'boneMass' | 'bodyWater' | 'bmr'

/** One Health Connect record: kg, %, or kcal/day for the metabolic rate. */
export interface BodySample {
  type: BodySampleType
  id: string
  time: number
  value: number
  /** Package of the app that wrote it. */
  origin: string
}

export interface SleepSessionSample {
  id: string
  start: number
  end: number
  origin: string
  /** Health Connect's stage codes (SleepSessionRecord.STAGE_TYPE_*). */
  stages: { start: number; end: number; stage: number }[]
}

export interface HealthConnectAccess {
  /** "weight", "bodyFat"…, "sleep": the types the app may read. */
  granted: string[]
  /** Whether reads can go further back than 30 days. */
  history: boolean
  historyAvailable: boolean
}

/** The native side lives in android/app/src/main/java/.../HealthConnectPlugin.kt. */
interface HealthConnectPlugin {
  availability(): Promise<{ status: 'available' | 'update_required' | 'unavailable' }>
  checkAccess(): Promise<HealthConnectAccess>
  requestAccess(): Promise<HealthConnectAccess>
  readBody(range: { from: number; to: number }): Promise<{ samples: BodySample[] }>
  readSleep(range: { from: number; to: number }): Promise<{ sessions: SleepSessionSample[] }>
}

export const HealthConnect = registerPlugin<HealthConnectPlugin>('HealthConnect')

/** True inside the Android app (Capacitor), where Health Connect is reachable. */
export const isAndroidApp = (): boolean => Capacitor.getPlatform() === 'android'
