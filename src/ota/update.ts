/**
 * Looking for a newer version of the web part on the site and downloading it, in the background. It
 * only takes over at the next start (boot.ts), never under the user's feet.
 */
import { unzipSync } from 'fflate'
import { isAndroidApp } from '../features/healthconnect/plugin'
import {
  bytesToBase64,
  checkDue,
  cleanupPlan,
  decideManifest,
  folderName,
  isSafeEntryName,
  toHex,
  type Manifest,
  type OtaState,
} from './decide'
import { PREVIOUS_KEY, session } from './keys'
import {
  bundleDir,
  hasLiveWorkout,
  listBundles,
  MANIFEST_URL,
  nativeLevel,
  readState,
  removeBundle,
  renameBundle,
  RUNNING,
  servedPath,
  writeBundleFile,
  writeState,
} from './native'
import { loadSnapshot, setSnapshot } from './store'

let running: Promise<void> | undefined
/** The build being written to bundles/<build>.tmp, which a cleanup must leave alone. */
let downloading: string | undefined

/**
 * Looks for a newer version and downloads it. On its own (`force` false) only when online, not during a
 * workout and at most every six hours; the button in Ajustes looks right away.
 */
export function checkForUpdate(force = false): Promise<void> {
  if (!isAndroidApp()) return Promise.resolve()
  running ??= check(force).finally(() => {
    running = undefined
  })
  return running
}

async function check(force: boolean): Promise<void> {
  if (!force) {
    const state = await readState()
    if (!navigator.onLine || !checkDue(state, Date.now()) || (await hasLiveWorkout())) return
  }
  setSnapshot({ phase: 'checking', error: undefined })
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
    if (!response.ok) throw new Error(`O site respondeu ${response.status}.`)
    const raw: unknown = await response.json()
    const level = await nativeLevel()
    const state: OtaState = { ...(await readState()), checkedAt: Date.now() }
    const decision = decideManifest(raw, RUNNING, state, level)
    if (decision.kind === 'needsCable') {
      state.needsCable = { build: decision.manifest.build, minNative: decision.manifest.minNative }
    } else if (decision.kind !== 'invalid') {
      delete state.needsCable
    }
    await writeState(state)
    setSnapshot({ state })
    if (decision.kind === 'invalid') throw new Error('O site publicou uma versão que o app não entende.')
    if (decision.kind === 'download') {
      setSnapshot({ phase: 'downloading' })
      await download(decision.manifest)
    }
  } catch (error) {
    setSnapshot({ error: error instanceof Error ? error.message : String(error) })
  } finally {
    setSnapshot({ phase: 'idle' })
    await loadSnapshot().catch(() => undefined)
  }
}

/** The zip's file names, without inflating anything. */
function entryNames(data: Uint8Array): string[] {
  const names: string[] = []
  unzipSync(data, {
    filter: (file) => {
      names.push(file.name)
      return false
    },
  })
  return names
}

/**
 * Downloads and checks the bundle, writes it file by file to bundles/<build>.tmp and only then renames
 * it to bundles/<build>, so a folder cut halfway is never served. It becomes the target for the next start.
 */
async function download(manifest: Manifest): Promise<void> {
  const response = await fetch(new URL(manifest.zip, MANIFEST_URL).href)
  if (!response.ok) throw new Error(`O site respondeu ${response.status} ao baixar a versão nova.`)
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength !== manifest.size) throw new Error('A versão nova chegou incompleta.')
  if (toHex(await crypto.subtle.digest('SHA-256', buffer)) !== manifest.sha256) {
    throw new Error('A versão nova chegou diferente da publicada.')
  }
  const data = new Uint8Array(buffer)
  // Folder entries (a name ending in /) carry nothing: the folders come with the files.
  const names = entryNames(data).filter((name) => !name.endsWith('/'))
  if (names.length !== manifest.files || !names.includes('index.html') || !names.every(isSafeEntryName)) {
    throw new Error('A versão nova tem arquivos que o app não aceita.')
  }

  const temp = `${manifest.build}.tmp`
  downloading = manifest.build
  try {
    await removeBundle(temp)
    // One file inflated at a time: the whole app unpacked at once is a lot of memory for a phone.
    for (const name of names) {
      const bytes = unzipSync(data, { filter: (file) => file.name === name })[name]
      if (!bytes) throw new Error('A versão nova tem um arquivo que não abre.')
      await writeBundleFile(temp, name, bytesToBase64(bytes))
    }
    await removeBundle(manifest.build)
    await renameBundle(temp, manifest.build)
  } catch (error) {
    await removeBundle(temp)
    throw error
  } finally {
    downloading = undefined
  }

  const dir = await bundleDir(manifest.build)
  const state = await readState()
  delete state.needsCable
  await writeState({ ...state, target: { build: manifest.build, time: manifest.time, dir, tries: 0, confirmed: false } })
  await cleanBundles()
}

/**
 * Deletes the folders no longer in use: all but the target, the one served now and the one a switch in
 * this process came from (still the way back if the new one fails).
 */
export async function cleanBundles(): Promise<void> {
  const [state, served, entries] = await Promise.all([readState(), servedPath(), listBundles()])
  const keep = [state.target?.dir, served, session.get(PREVIOUS_KEY) ?? undefined]
    .filter((path): path is string => !!path?.startsWith('/'))
    .map(folderName)
  for (const name of cleanupPlan(entries, keep, downloading)) await removeBundle(name)
}
