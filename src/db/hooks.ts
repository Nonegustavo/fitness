import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { dayKey, type DayKey } from '../lib/dates'
import { DEFAULT_SETTINGS, SETTINGS_ID, db } from './schema'
import type { Settings } from './types'

const fallbackSettings: Settings = { id: SETTINGS_ID, ...DEFAULT_SETTINGS, updatedAt: 0, deleted: 0, dirty: 0 }

export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get(SETTINGS_ID)) ?? fallbackSettings
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
