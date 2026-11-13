import { useMemo, useSyncExternalStore } from 'react'
import { useNow } from '../../db/hooks'
import { db } from '../../db/schema'
import { useShared } from '../../db/shared'
import { useNeedsCable } from '../../ota/store'
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

/**
 * Records changed on this device and not sent yet. One count for every place that shows it (the dots,
 * the status card, the sync's line): it looks at every synced table again after each write.
 */
export const usePendingRecords = (): number => useShared('pendingRecords', () => countPending(db)) ?? 0

/** How every source of data on this device is doing, live (see `sourceHealth`). */
export function useSourceHealth(): SourceHealth[] {
  const sync = useSyncState()
  const pending = usePendingRecords()
  const online = useOnline()
  const garmin = useGarminState()
  const hc = useHealthConnectState()
  const plan = useCoachPlan()
  const photos = usePendingPhotos()
  // In the Android app: a published version that this APK is too old for.
  const update = useNeedsCable()
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
          update,
        },
        now,
      ),
    [sync, pending, online, garmin, hc, plan, photos, update, now, android],
  )
}
