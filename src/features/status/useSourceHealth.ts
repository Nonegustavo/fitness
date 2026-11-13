import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useSyncExternalStore } from 'react'
import { useNow } from '../../db/hooks'
import { db } from '../../db/schema'
import { useSyncState } from '../../sync/controller'
import { countPending } from '../../sync/engine'
import { usePendingPhotos } from '../food/photos'
import { useGarminState } from '../garmin/sync'
import { isAndroidApp } from '../healthconnect/plugin'
import { useHealthConnectState } from '../healthconnect/sync'
import { useCoachPlan } from '../sisrun/coachPlan'
import { sourceHealth, type SourceHealth } from './health'

const subscribeOnline = (listener: () => void) => {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

const useOnline = (): boolean => useSyncExternalStore(subscribeOnline, () => navigator.onLine)

/** How every source of data on this device is doing, live (see `sourceHealth`). */
export function useSourceHealth(): SourceHealth[] {
  const sync = useSyncState()
  const pending = useLiveQuery(() => countPending(db)) ?? 0
  const online = useOnline()
  const garmin = useGarminState()
  const hc = useHealthConnectState()
  const plan = useCoachPlan()
  const photos = usePendingPhotos()
  // "More than 48 hours", "more than an hour": checked every minute is plenty.
  const now = useNow(60_000).getTime()
  const android = isAndroidApp()

  return useMemo(
    () =>
      sourceHealth(
        {
          sync: {
            configured: sync.configured,
            authChecked: !!sync.authChecked,
            signedIn: !!sync.email,
            expired: sync.expired,
            phase: sync.phase,
            online,
            error: sync.error,
            errorDetail: sync.errorDetail,
            lastOkAt: sync.lastOkAt,
            pending,
          },
          garmin: { syncing: garmin.phase === 'syncing', lastOkAt: garmin.lastOkAt, lastError: garmin.lastError },
          healthConnect: android
            ? {
                availability: hc.availability,
                granted: (hc.access?.granted.length ?? 0) > 0,
                busy: hc.phase === 'busy',
                lastOkAt: hc.lastOkAt,
                lastError: hc.lastError,
              }
            : undefined,
          sisrun: plan,
          photos: photos ?? { count: 0 },
        },
        now,
      ),
    [sync, pending, online, garmin, hc, plan, photos, now, android],
  )
}
