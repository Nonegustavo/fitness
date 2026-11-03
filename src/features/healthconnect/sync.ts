import { useSyncExternalStore } from 'react'
import { notifyLocalChange } from '../../db/events'
import { db } from '../../db/schema'
import { saveHealth } from '../garmin/health'
import { sleepNights, stageTotals, weighIns } from './mapping'
import { HealthConnect, isAndroidApp, type HealthConnectAccess } from './plugin'

const DAY = 86_400_000
/** The first import, and any import without the history permission, reach this far back. */
const FIRST_DAYS = 30
/** "Importar todo o histórico" starts here: before any Mi scale or Garmin data. */
const HISTORY_START = Date.UTC(2015, 0, 1)
const AUTO_EVERY_MS = 30 * 60_000
const META_KEY = 'healthConnect'

export interface HealthConnectState {
  availability?: 'available' | 'update_required' | 'unavailable'
  access?: HealthConnectAccess
  phase: 'idle' | 'busy' | 'error'
  message?: string
  lastImportAt?: number
}

let state: HealthConnectState = { phase: 'idle' }
const listeners = new Set<() => void>()

function setState(changes: Partial<HealthConnectState>) {
  state = { ...state, ...changes }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useHealthConnectState = (): HealthConnectState => useSyncExternalStore(subscribe, () => state)

const readMeta = async () => ((await db.meta.get(META_KEY))?.value as { lastImportAt?: number } | undefined) ?? {}

/** Whether Health Connect is on the phone, and what the app may read. */
export async function refreshHealthConnect(): Promise<void> {
  const { status } = await HealthConnect.availability()
  const access = status === 'available' ? await HealthConnect.checkAccess() : undefined
  setState({ availability: status, access, lastImportAt: (await readMeta()).lastImportAt })
}

/** Opens Health Connect's permission screen, then imports what was allowed. */
export async function connectHealthConnect(): Promise<void> {
  try {
    const access = await HealthConnect.requestAccess()
    setState({ access })
    if (access.granted.length > 0) await importHealthConnect()
  } catch (error) {
    setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}

let running = false

/** Weigh-ins and sleep stages since the last import, or the whole history with `full`. */
export async function importHealthConnect({ full = false } = {}): Promise<void> {
  if (running || !isAndroidApp()) return
  running = true
  setState({ phase: 'busy', message: undefined })
  try {
    const now = Date.now()
    const meta = await readMeta()
    // Without the history permission, Health Connect only shows the last 30 days anyway.
    const from =
      full && state.access?.history
        ? HISTORY_START
        : meta.lastImportAt
          ? meta.lastImportAt - 2 * DAY
          : now - FIRST_DAYS * DAY

    const { samples } = await HealthConnect.readBody({ from, to: now })
    let added = 0
    await db.transaction('rw', db.weights, async () => {
      for (const entry of weighIns(samples)) {
        // Already here, or deleted on purpose: either way, not brought back.
        if (await db.weights.get(entry.id)) continue
        await db.weights.put({ ...entry, updatedAt: now, deleted: 0, dirty: 1 })
        added++
      }
    })
    if (added > 0) notifyLocalChange()

    const { sessions } = await HealthConnect.readSleep({ from, to: now })
    const stages = sleepNights(sessions)
    // The Garmin API's totals win; nights it hasn't brought get them from the stages.
    const days = await db.dailyHealth.bulkGet(stages.map((night) => night.id))
    const nights = await saveHealth(
      stages.map((night, i) => {
        const day = days[i]
        return day?.sleep && !day.deleted ? night : { ...night, sleep: stageTotals(night.sleepStages) }
      }),
    )

    await db.meta.put({ key: META_KEY, value: { lastImportAt: now } })
    setState({
      phase: 'idle',
      lastImportAt: now,
      message: `${added === 1 ? '1 pesagem nova' : `${added} pesagens novas`} · ${
        nights === 1 ? '1 noite atualizada' : `${nights} noites atualizadas`
      }`,
    })
  } catch (error) {
    setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
  } finally {
    running = false
  }
}

/** In the Android app: imports when it opens or comes back, at most every 30 minutes. */
export function startHealthConnectSync(): void {
  if (!isAndroidApp()) return
  const check = async () => {
    if (document.visibilityState !== 'visible') return
    await refreshHealthConnect().catch(() => undefined)
    if (!state.access?.granted.length) return
    if (Date.now() - ((await readMeta()).lastImportAt ?? 0) >= AUTO_EVERY_MS) await importHealthConnect()
  }
  document.addEventListener('visibilitychange', () => void check())
  void check()
}
