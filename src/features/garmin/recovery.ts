import { useLiveQuery } from 'dexie-react-hooks'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import type { DailyHealth, SleepStage } from '../../db/types'
import type { DayKey } from '../../lib/dates'

/** The days in [from, to] that have health data, oldest first. */
export function useDailyHealth(from: DayKey, to: DayKey): DailyHealth[] | undefined {
  return useLiveQuery(
    async () => alive(await db.dailyHealth.where('id').between(from, to, true, true).toArray()),
    [from, to],
  )
}

/** The latest day with a night or an HRV reading. */
export const latestNight = (days: DailyHealth[]): DailyHealth | undefined =>
  [...days].reverse().find((day) => day.sleep || day.hrv)

const HRV_STATUS: Record<string, string> = {
  BALANCED: 'Equilibrada',
  UNBALANCED: 'Desequilibrada',
  LOW: 'Baixa',
  POOR: 'Ruim',
}

export const hrvStatus = (status: string | undefined): string | undefined => (status ? HRV_STATUS[status] : undefined)

export interface StagePart {
  key: SleepStage
  label: string
  seconds: number
}

// Light sleep is a fainter step of deep sleep's blue, in both themes.
export const STAGE_CLASS: Record<SleepStage, string> = {
  deep: 'bg-series-1',
  light: 'bg-series-1/45',
  rem: 'bg-series-2',
  awake: 'bg-muted',
}

/** The night's stages in the order the bar draws them. */
export function sleepStages(sleep: NonNullable<DailyHealth['sleep']>): StagePart[] {
  const parts: StagePart[] = [
    { key: 'deep', label: 'Profundo', seconds: sleep.deepSec ?? 0 },
    { key: 'light', label: 'Leve', seconds: sleep.lightSec ?? 0 },
    { key: 'rem', label: 'REM', seconds: sleep.remSec ?? 0 },
    { key: 'awake', label: 'Acordado', seconds: sleep.awakeSec ?? 0 },
  ]
  return parts.filter((part) => part.seconds > 0)
}
