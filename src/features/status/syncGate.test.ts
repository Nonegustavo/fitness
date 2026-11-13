import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { SYNC_GRACE_MS, syncWaitMs } from './syncGate'

describe('syncWaitMs', () => {
  const signedIn = { configured: true, email: 'a@b.c' }

  it('goes now without an account or once a sync finished', () => {
    expect(syncWaitMs({ configured: false, email: null }, false)).toBe(0)
    expect(syncWaitMs({ configured: true, email: null }, false)).toBe(0)
    expect(syncWaitMs({ ...signedIn, lastSyncAt: 1 }, false)).toBe(0)
  })

  it('waits as long as it takes on a device that never pulled', () => {
    expect(syncWaitMs(signedIn, false)).toBe(Infinity)
  })

  it('waits a little on a device that pulled before', () => {
    expect(syncWaitMs(signedIn, true)).toBe(SYNC_GRACE_MS)
  })
})
