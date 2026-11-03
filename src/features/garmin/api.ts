import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../sync/supabase'

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

/** Calls the `garmin` function (supabase/functions), which holds the personal API key. */
async function call<T>(body: object): Promise<T> {
  if (!supabase) throw new GarminError('Configure a sincronização para usar o Garmin.')
  const { data, error } = await supabase.functions.invoke('garmin', { body })
  if (error instanceof FunctionsHttpError) {
    const payload = (await error.context.json().catch(() => null)) as { error?: string; missing?: 'key' | 'calendar' } | null
    throw new GarminError(payload?.error ?? 'O Garmin não respondeu.', error.context.status, payload?.missing)
  }
  if (error) throw new GarminError('Não foi possível falar com o servidor. Confira a internet.')
  return data as T
}

export const garminGet = <T>(path: string, query?: Record<string, string | number>) => call<T | null>({ path, query })

/** The activity's original file, which Garmin sends inside a zip. */
export async function garminFile(activityId: number): Promise<Uint8Array> {
  const blob = await call<Blob>({ path: `/download-service/files/activity/${activityId}` })
  return new Uint8Array(await blob.arrayBuffer())
}

/** The published Garmin Connect calendar, as iCal text. */
export const garminCalendar = () => call<string>({ calendar: true })

/** Turns "no data" (404) into null, so one missing piece doesn't fail a whole sync. */
export async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request
  } catch (error) {
    if (error instanceof GarminError && error.status === 404) return null
    throw error
  }
}
