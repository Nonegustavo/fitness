/**
 * The Android app updating itself: a newer version of the web part, downloaded earlier (update.ts),
 * takes over when the app starts, or when it comes back after a long while away. The new version keeps
 * itself once it is on screen; one that doesn't come up is thrown away and the previous one returns.
 */
import { db } from '../db/schema'
import { isAndroidApp } from '../features/healthconnect/plugin'
import { decideBoot, decideConfirm, folderName, refuse, type OtaState } from './decide'
import { HASH_KEY, PERSIST_KEY, PREVIOUS_KEY, session } from './keys'
import {
  canServe,
  hasLiveWorkout,
  INSTALLED_PATH,
  persistServed,
  readState,
  removeBundle,
  RUNNING,
  serveFrom,
  servedPath,
  writeState,
} from './native'
import { loadSnapshot } from './store'
import { checkForUpdate, cleanBundles } from './update'

/** A start never waits longer than this for the switch: past it, this version just opens. */
const SWITCH_TIMEOUT_MS = 4000
/** Time for the new version to come up before it is judged. */
const CONFIRM_AFTER_MS = 3000
/** Away from the app this long, a reload into the new version goes unnoticed. */
const SWITCH_AFTER_HIDDEN_MS = 30 * 60 * 1000
/** The first look for a new version, after the start's own work. */
const FIRST_CHECK_AFTER_MS = 10_000

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, delay(ms).then(() => fallback)])
}

const withoutTarget = (state: OtaState): OtaState => {
  const next = { ...state }
  delete next.target
  return next
}

/** Reloads the app from another folder, keeping the screen that was open (early.ts puts it back). */
async function reloadInto(path: string): Promise<void> {
  session.set(HASH_KEY, location.hash)
  // The reload must not leave an entry behind: Back in the app asks the WebView whether it can go back.
  history.replaceState(null, '', location.pathname)
  await serveFrom(path)
}

/** Back to the installed version by the user's choice: made permanent here, once that version runs. */
async function finishGoingBack(): Promise<void> {
  if (session.get(PERSIST_KEY) === null) return
  session.remove(PERSIST_KEY)
  await persistServed()
  void cleanBundles().catch(() => undefined)
}

type SwitchResult = 'switched' | 'wait' | 'none'

/**
 * Switches to the downloaded version when there is one to switch to. `late` turns true when the start
 * stopped waiting: then nothing reloads the app that has already opened.
 */
async function trySwitch(guard: { late: boolean } = { late: false }): Promise<SwitchResult> {
  await finishGoingBack()
  const state = await readState()
  const decision = decideBoot(state, RUNNING, await hasLiveWorkout())
  switch (decision.kind) {
    case 'none':
      return 'none'
    case 'wait':
      return 'wait'
    case 'stale':
    case 'failed': {
      await writeState(decision.kind === 'failed' ? refuse(state, decision.target.build, true) : withoutTarget(state))
      const name = folderName(decision.target.dir)
      if (name && name !== folderName(await servedPath())) await removeBundle(name)
      void loadSnapshot().catch(() => undefined)
      return 'none'
    }
    case 'switch': {
      const { target } = decision
      if (!(await canServe(target.dir))) {
        // Its folder is gone: nothing to switch to, and it would open on a blank page.
        await writeState(withoutTarget(state))
        return 'none'
      }
      if (guard.late) return 'none'
      // Counted before trying: a version that dies before confirming is given up on the second time.
      await writeState({ ...state, target: { ...target, tries: target.tries + 1 } })
      session.set(PREVIOUS_KEY, await servedPath())
      await reloadInto(target.dir)
      return 'switched'
    }
  }
}

/** Whether the page is reloading into a newer version: then this one must not start anything. */
export async function switchBundle(): Promise<boolean> {
  if (!isAndroidApp()) return false
  const guard = { late: false }
  try {
    const result = await withTimeout(
      trySwitch(guard).catch(() => 'none' as const),
      SWITCH_TIMEOUT_MS,
      'none' as const,
    )
    guard.late = true
    return result === 'switched'
  } catch {
    return false
  }
}

/** Ajustes → "Reiniciar para atualizar": the waiting version now. */
export async function restartIntoUpdate(): Promise<void> {
  const result = await trySwitch()
  if (result === 'wait') throw new Error('Termine o treino antes de atualizar.')
  if (result === 'none') throw new Error('Não há versão nova esperando.')
}

/**
 * Ajustes → "Voltar à versão instalada": the APK's own files from now on, and the running version is
 * never applied again (a newer one still is).
 */
export async function backToInstalled(): Promise<void> {
  await writeState(refuse(await readState(), RUNNING.build, false))
  session.remove(PREVIOUS_KEY)
  // Persisting has to wait for the installed version to run: it stores whatever is served at that moment.
  session.set(PERSIST_KEY, '1')
  await reloadInto(INSTALLED_PATH)
}

/** Whether the app really came up: the screen's frame is drawn (not the router's error page) and the database opens. */
async function healthy(): Promise<boolean> {
  if (!document.querySelector('[data-screen]')) return false
  return withTimeout(
    db.open().then(
      () => true,
      () => false,
    ),
    15_000,
    false,
  )
}

/** Right after a switch: keep this version for good, or go back to the one before. */
async function confirm(): Promise<void> {
  if ((await readState()).target?.build !== RUNNING.build) return
  await delay(CONFIRM_AFTER_MS)
  const ok = await healthy()
  const state = await readState()
  const decision = decideConfirm(state, RUNNING, ok, await servedPath())
  if (decision.kind === 'keep') {
    await persistServed()
    const next: OtaState = { ...state, target: { ...decision.target, confirmed: true } }
    delete next.failed
    await writeState(next)
    session.remove(PREVIOUS_KEY)
    await cleanBundles()
  } else if (decision.kind === 'rollback') {
    await writeState(refuse(state, decision.target.build, true))
    const previous = session.get(PREVIOUS_KEY) ?? INSTALLED_PATH
    session.remove(PREVIOUS_KEY)
    await reloadInto((await canServe(previous)) ? previous : INSTALLED_PATH)
  }
}

let started = false

/** Called once the app is on screen: a version that got this far is kept, and the background work begins. */
export function bundleStarted(): void {
  if (!isAndroidApp() || started) return
  started = true
  void loadSnapshot().catch(() => undefined)
  void confirm()
    .catch(() => undefined)
    .finally(() => void loadSnapshot().catch(() => undefined))
  setTimeout(() => void checkForUpdate().catch(() => undefined), FIRST_CHECK_AFTER_MS)

  // The app mostly comes back from the background instead of starting: that's when it looks again, and,
  // after a long while away, when a waiting version takes over (with no sheet open and no workout going).
  let hiddenAt: number | undefined
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now()
      return
    }
    const away = hiddenAt === undefined ? 0 : Date.now() - hiddenAt
    hiddenAt = undefined
    void (async () => {
      if (away >= SWITCH_AFTER_HIDDEN_MS && !document.querySelector('[role="dialog"]')) {
        if ((await trySwitch()) === 'switched') return
      }
      await checkForUpdate()
    })().catch(() => undefined)
  })
}
