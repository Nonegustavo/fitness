/**
 * What the update card shows, kept outside React so the background check and the card share it.
 */
import { useSyncExternalStore } from 'react'
import { isAndroidApp } from '../features/healthconnect/plugin'
import type { OtaState } from './decide'
import { nativeLevel, readState, servedPath } from './native'

export interface OtaSnapshot {
  /** Undefined until read from the phone. */
  state?: OtaState
  phase: 'idle' | 'checking' | 'downloading'
  /** Why the last look failed. */
  error?: string
  /** Where the running version is served from: 'public' (installed with the APK) or a downloaded folder. */
  served?: string
  nativeLevel?: number
}

let snapshot: OtaSnapshot = { phase: 'idle' }
const listeners = new Set<() => void>()

export function setSnapshot(patch: Partial<OtaSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const getSnapshot = () => snapshot

/** Reads the state, the served folder and the native level again (Android only). */
export async function loadSnapshot(): Promise<void> {
  if (!isAndroidApp()) return
  const [state, served, level] = await Promise.all([readState(), servedPath(), nativeLevel()])
  setSnapshot({ state, served, nativeLevel: level })
}

export const useOta = (): OtaSnapshot => useSyncExternalStore(subscribe, getSnapshot)

/** Whether a newer version waits for an APK installed by cable; undefined outside the app or before knowing. */
export function needsCableOf(current: OtaSnapshot): { needsCable: boolean } | undefined {
  if (!isAndroidApp() || !current.state) return undefined
  const cable = current.state.needsCable
  // An APK installed since then may already have the level.
  return { needsCable: !!cable && (current.nativeLevel === undefined || cable.minNative > current.nativeLevel) }
}

/** For the "Estado das fontes" card. */
export const useNeedsCable = (): { needsCable: boolean } | undefined => needsCableOf(useOta())
