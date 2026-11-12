import { FunctionError, invokeFunction } from '../../sync/functions'

/** A failed Garmin call. The message reads well as is; `missing` names the secret to add. */
export class GarminError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly missing?: 'key' | 'calendar',
  ) {
    super(message)
  }
}

/** A whole activity file can take a while on a phone's connection; past this, the sync gives up for now. */
const TIMEOUT_MS = 60_000

/** Calls the `garmin` function (supabase/functions), which holds the personal API key. */
async function call<T>(body: object): Promise<T> {
  try {
    return await invokeFunction<T>('garmin', body, {
      unconfigured: 'Configure a sincronização para usar o Garmin.',
      fallback: 'O Garmin não respondeu.',
      timeoutMs: TIMEOUT_MS,
    })
  } catch (error) {
    if (!(error instanceof FunctionError)) throw error
    const missing = error.payload.missing
    throw new GarminError(error.message, error.status, missing === 'key' || missing === 'calendar' ? missing : undefined)
  }
}

export const garminGet = <T>(path: string, query?: Record<string, string | number>) => call<T | null>({ path, query })

/** The activity's original file, which Garmin sends inside a zip. */
export async function garminFile(activityId: number): Promise<Uint8Array> {
  const blob = await call<Blob>({ path: `/download-service/files/activity/${activityId}` })
  return new Uint8Array(await blob.arrayBuffer())
}

/** The published Garmin Connect calendar, as iCal text. */
export const garminCalendar = () => call<string>({ calendar: true })

/** The published calendar's link, for the Android app's check in the background (src/features/sisrun/watch.ts). */
export const garminCalendarLink = () => call<{ url?: string }>({ calendarLink: true })

/** Turns "no data" (404) into null, so one missing piece doesn't fail a whole sync. */
export async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request
  } catch (error) {
    if (error instanceof GarminError && error.status === 404) return null
    throw error
  }
}
