/**
 * Everything the self-update touches outside the page: the bundles folder and its state.json (through
 * the Filesystem plugin, in the app's own files), the WebView's served folder, the APK's native level and
 * the workout in progress. Kept thin so the decisions (decide.ts) can be tested without a phone.
 */
import { registerPlugin, WebView } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { db } from '../db/schema'
import { folderName, parseState, STATE_FILE, uriToPath, type OtaState } from './decide'

/** Where the bundle manifest is published with the site (scripts/pack-android.mjs, pages.yml). */
export const MANIFEST_URL = 'https://nonegustavo.github.io/fitness/android/manifest.json'

/** The version this page runs (vite.config.ts). */
export const RUNNING = { build: __BUILD__, time: __BUILD_TIME__ }

/** The APK's own web files, as the WebView names them. */
export const INSTALLED_PATH = 'public'

const ROOT = 'bundles'
const DATA = Directory.Data

/** The native side lives in android/app/src/main/java/.../AppInfoPlugin.kt. */
interface AppInfoPlugin {
  info(): Promise<{ nativeLevel: number; versionCode: number; versionName: string }>
}

const AppInfo = registerPlugin<AppInfoPlugin>('AppInfo')

/** The APK's native level; 0 for an APK without the plugin (it can't run any downloaded version). */
export const nativeLevel = (): Promise<number> =>
  AppInfo.info().then(
    (info) => (Number.isInteger(info.nativeLevel) ? info.nativeLevel : 0),
    () => 0,
  )

export async function readState(): Promise<OtaState> {
  try {
    const { data } = await Filesystem.readFile({ path: `${ROOT}/${STATE_FILE}`, directory: DATA, encoding: Encoding.UTF8 })
    return parseState(JSON.parse(String(data)))
  } catch {
    return { bad: [] }
  }
}

export async function writeState(state: OtaState): Promise<void> {
  await Filesystem.writeFile({
    path: `${ROOT}/${STATE_FILE}`,
    data: JSON.stringify(state),
    directory: DATA,
    encoding: Encoding.UTF8,
    recursive: true,
  })
}

/** The absolute folder a bundle is served from. */
export async function bundleDir(name: string): Promise<string> {
  const { uri } = await Filesystem.getUri({ path: `${ROOT}/${name}`, directory: DATA })
  return uriToPath(uri)
}

/** The names under bundles/ (folders and state.json). */
export const listBundles = (): Promise<string[]> =>
  Filesystem.readdir({ path: ROOT, directory: DATA }).then(
    ({ files }) => files.map((file) => file.name),
    () => [],
  )

export const removeBundle = (name: string): Promise<void> =>
  Filesystem.rmdir({ path: `${ROOT}/${name}`, directory: DATA, recursive: true }).catch(() => undefined)

export async function writeBundleFile(folder: string, name: string, base64: string): Promise<void> {
  await Filesystem.writeFile({ path: `${ROOT}/${folder}/${name}`, data: base64, directory: DATA, recursive: true })
}

export async function renameBundle(from: string, to: string): Promise<void> {
  await Filesystem.rename({ from: `${ROOT}/${from}`, to: `${ROOT}/${to}`, directory: DATA, toDirectory: DATA })
}

/**
 * Whether a served folder is there to load: a downloaded one (always bundles/<build>) needs its
 * index.html; the APK's files always are.
 */
export async function canServe(path: string): Promise<boolean> {
  if (!path.startsWith('/')) return true
  try {
    await Filesystem.stat({ path: `${ROOT}/${folderName(path)}/index.html`, directory: DATA })
    return true
  } catch {
    return false
  }
}

/** The folder the WebView serves the app from: an absolute path for a downloaded version, else 'public'. */
export const servedPath = (): Promise<string> =>
  WebView.getServerBasePath().then(
    ({ path }) => path || INSTALLED_PATH,
    () => INSTALLED_PATH,
  )

/** Serves the app from that folder (or the APK's files) and reloads it there. */
export async function serveFrom(path: string): Promise<void> {
  if (path.startsWith('/')) await WebView.setServerBasePath({ path })
  else await WebView.setServerAssetPath({ path: INSTALLED_PATH })
}

/** Makes the folder served now the one the app opens with next time. */
export const persistServed = (): Promise<void> => WebView.persistServerBasePath()

/** A gym workout going on (training.ts findActive): the app must not reload under it. */
export const hasLiveWorkout = (): Promise<boolean> =>
  db.workoutSessions
    .filter((session) => !session.endedAt && !session.deleted)
    .count()
    .then(
      (count) => count > 0,
      () => false,
    )
