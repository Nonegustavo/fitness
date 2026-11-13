import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { dayKey, type DayKey } from '../lib/dates'
import { DEFAULT_SETTINGS, SETTINGS_ID, db } from './schema'
import { useShared } from './shared'
import type { Settings } from './types'

const fallbackSettings: Settings = { id: SETTINGS_ID, ...DEFAULT_SETTINGS, updatedAt: 0, deleted: 0, dirty: 0 }

/** The settings row, null when there is none; shared by every component (never change it in place). */
const useStoredSettings = (): Settings | null | undefined =>
  useShared('settings', async () => (await db.settings.get(SETTINGS_ID)) ?? null)

/** The settings; the defaults while they load. */
export function useSettings(): Settings {
  return useStoredSettings() ?? fallbackSettings
}

/** Whether the settings were read (a screen laid out by them can wait instead of showing the defaults first). */
export const useSettingsRead = (): boolean => useStoredSettings() !== undefined

/** A query's answer, tagged with the key it was asked for. */
export interface KeyedAnswer<T> {
  key: string
  value: T
}

/** The answer if it is the key's, else undefined: the key's own answer is still on its way. */
export const answerFor = <T>(answer: KeyedAnswer<T> | undefined, key: string): T | undefined =>
  answer?.key === key ? answer.value : undefined

/**
 * useLiveQuery for one key (a day): undefined until the answer for *that* key arrives. Plain
 * useLiveQuery hands back the previous key's answer for a moment after the key changes, and a form
 * started from it took the other day's text as this one's.
 */
export function useKeyedLiveQuery<T>(key: string, query: () => Promise<T>): T | undefined {
  return answerFor(
    useLiveQuery(async (): Promise<KeyedAnswer<T>> => ({ key, value: await query() }), [key]),
    key,
  )
}

/** The time now, moved forward every `everyMs` and when the app comes back to the foreground. */
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(new Date())
    document.addEventListener('visibilitychange', refresh)
    const timer = setInterval(refresh, everyMs)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(timer)
    }
  }, [everyMs])
  return now
}

/** Today's day key, refreshed when the app comes back to the foreground or the clock passes midnight. */
export function useToday(): DayKey {
  const [today, setToday] = useState(() => dayKey())
  useEffect(() => {
    const refresh = () => setToday(dayKey())
    document.addEventListener('visibilitychange', refresh)
    const timer = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(timer)
    }
  }, [])
  return today
}
