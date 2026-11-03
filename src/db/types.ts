import type { DayKey } from '../lib/dates'

/** Fields every synced row carries. Booleans are 0/1 because IndexedDB can't index them. */
export interface Synced {
  id: string
  /** Client timestamp (ms) of the last change; the newest change wins on sync. */
  updatedAt: number
  deleted: 0 | 1
  /** 1 while the change hasn't reached the server. */
  dirty: 0 | 1
}

export interface WeightEntry extends Synced {
  date: DayKey
  time: number
  weightKg: number
  bodyFatPct?: number
  muscleMassKg?: number
  bodyWaterPct?: number
  visceralFat?: number
  boneMassKg?: number
  bmrKcal?: number
  source: 'manual' | 'health-connect'
  note?: string
}

export interface MeasurementEntry extends Synced {
  date: DayKey
  /** Centimeters by measurement site key. */
  values: Record<string, number>
  note?: string
}

export type ContainerIcon = 'glass' | 'bottle' | 'mug' | 'cup'

export interface WaterContainer extends Synced {
  name: string
  ml: number
  icon: ContainerIcon
  favorite: 0 | 1
  order: number
}

export interface WaterLog extends Synced {
  date: DayKey
  time: number
  ml: number
  containerId?: string
}

export interface Habit extends Synced {
  name: string
  /** "check" is done/not done; "count" records a quantity (cups, doses…). */
  kind: 'check' | 'count'
  unit?: string
  /** "good" habits are goals to meet; "bad" ones are things to avoid. */
  polarity: 'good' | 'bad'
  /** For count habits: the daily goal (good) or the daily limit (bad). */
  target?: number
  startDate: DayKey
  archived: 0 | 1
  order: number
}

export interface HabitLog extends Synced {
  /** Always `${habitId}:${date}`, so two devices logging the same day converge. */
  id: string
  habitId: string
  date: DayKey
  value: number
}

export interface MeasurementSite {
  key: string
  label: string
}

export interface Settings extends Synced {
  waterGoalMl: number
  measurementSites: MeasurementSite[]
}
