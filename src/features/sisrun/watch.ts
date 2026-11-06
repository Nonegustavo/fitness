import { registerPlugin } from '@capacitor/core'
import { alive } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import { dayKey } from '../../lib/dates'
import { getSyncState } from '../../sync/controller'
import { supabase } from '../../sync/supabase'
import { hiddenKeys } from '../calendar/agenda'
import { garminCalendarLink } from '../garmin/api'
import { isAndroidApp } from '../healthconnect/plugin'
import { calendarEvents, coachConfigured, readableWorkouts, readPlan } from './coachPlan'

/** The Android side (SisrunWatch.kt): the check of the Garmin calendar every 3 hours, with the app closed. */
interface SisrunWatchPlugin {
  configure(options: { enabled: boolean; url?: string; known?: string[]; hidden?: string[] }): Promise<void>
  check(options: { tell: boolean }): Promise<{ found: { key: string; date: string; title: string }[] }>
}

const SisrunWatch = registerPlugin<SisrunWatchPlugin>('SisrunWatch')

/** The calendar's link and whether the Android side already knows the calendar (local, this device only). */
const META_KEY = 'sisrunWatch'

interface WatchMeta {
  url?: string
  /** The Android side got the workouts of the calendar at least once: from then on, new ones are told. */
  seeded?: boolean
}

const readMeta = async (): Promise<WatchMeta> => ((await db.meta.get(META_KEY))?.value as WatchMeta | undefined) ?? {}

/** The link, asked once of the garmin function and kept on this device. */
async function calendarLink(meta: WatchMeta): Promise<string | undefined> {
  if (meta.url) return meta.url
  const { url } = await garminCalendarLink()
  if (url) await db.meta.put({ key: META_KEY, value: { ...meta, url } })
  return url
}

/**
 * Keeps the Android watch for new SisRUN workouts in step with the app: on while SisRUN is set up and
 * the alerts are on (Ajustes), with the calendar's link, the SisRUN workouts this device has in its
 * calendar and the hidden ones; off when the alerts are turned off or SisRUN's secrets are missing.
 * While the session or the calendar hasn't loaded, it's left as it was. With `check`, after the app's
 * own Garmin sync brought the calendar, the Android side first tells about the ones it didn't know
 * (so a week that arrives while the app is open is told too). The first time it only learns them, so
 * turning it on tells nothing. Nothing outside the Android app; a failure is left for the next sync.
 */
export async function syncWatch({ check = false } = {}): Promise<void> {
  if (!isAndroidApp() || !supabase || !getSyncState().email) return
  try {
    const [plan, settings, events, times, meta] = await Promise.all([
      readPlan(),
      db.settings.get(SETTINGS_ID),
      calendarEvents(),
      db.eventTimes.toArray(),
      readMeta(),
    ])
    if (settings?.sisrunAlerts === false || plan.error?.missing) {
      await SisrunWatch.configure({ enabled: false })
      if (meta.seeded) await db.meta.put({ key: META_KEY, value: { ...meta, seeded: false } })
      return
    }
    if (!coachConfigured(plan) || events === null) return
    const url = await calendarLink(meta)
    if (!url) return
    if (check && meta.seeded) await SisrunWatch.check({ tell: true })
    const live = alive(times)
    await SisrunWatch.configure({
      enabled: true,
      url,
      known: readableWorkouts(events, live, dayKey()).map(({ key }) => key),
      hidden: [...hiddenKeys(live)],
    })
    if (!meta.seeded) await db.meta.put({ key: META_KEY, value: { ...(await readMeta()), seeded: true } })
  } catch (error) {
    console.warn('Aviso de treinos novos do SisRUN indisponível', error)
  }
}
