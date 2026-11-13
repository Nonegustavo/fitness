/**
 * The decisions of the Android app updating its own web part, apart from the files and the WebView
 * (native.ts) so they can be tested: whether a published version is worth downloading, whether to
 * switch to a downloaded one at start, whether one that started is kept, and what to clean up.
 */

/** What the site publishes about the newest Android bundle (scripts/pack-android.mjs). */
export interface Manifest {
  build: string
  /** The commit's time in seconds: versions are ordered by it. */
  time: number
  /** The native level (native-level.json) the bundle needs from the APK. */
  minNative: number
  zip: string
  sha256: string
  size: number
  files: number
}

/** A downloaded version waiting to start, or the one that started and was kept. */
export interface Target {
  build: string
  time: number
  /** Absolute folder it is served from (no file://). */
  dir: string
  /** Times a start switched to it; a version that never confirms is given up on the second time. */
  tries: number
  confirmed: boolean
}

/** Kept in bundles/state.json. */
export interface OtaState {
  target?: Target
  /** Builds never to apply again: they didn't start, or the user went back from them. */
  bad: string[]
  /** When the site was last asked (ms). */
  checkedAt?: number
  /** The newest version needs a newer APK than the installed one. */
  needsCable?: { build: string; minNative: number }
  /** The last downloaded version that didn't start and was thrown away. */
  failed?: string
}

/** The version this page runs: __BUILD__ and __BUILD_TIME__. */
export interface Running {
  build: string
  time: number
}

export const EMPTY_STATE: OtaState = { bad: [] }

/** How many refused builds are remembered: the old ones are never newer than what's published. */
const MAX_BAD = 20

const BUILD_NAME = /^[A-Za-z0-9_-]{1,64}$/
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0
const isText = (value: unknown): value is string => typeof value === 'string'

/** The manifest as published, or undefined when anything about it is off. */
export function parseManifest(value: unknown): Manifest | undefined {
  if (!value || typeof value !== 'object') return undefined
  const m = value as Record<string, unknown>
  if (!isText(m.build) || !BUILD_NAME.test(m.build)) return undefined
  if (!isCount(m.time) || m.time <= 0 || !isCount(m.minNative) || !isCount(m.size) || m.size <= 0) return undefined
  if (!isCount(m.files) || m.files <= 0) return undefined
  if (!isText(m.zip) || !/^bundle-[A-Za-z0-9_-]{1,64}\.zip$/.test(m.zip)) return undefined
  if (!isText(m.sha256) || !/^[0-9a-f]{64}$/.test(m.sha256)) return undefined
  return { build: m.build, time: m.time, minNative: m.minNative, zip: m.zip, sha256: m.sha256, size: m.size, files: m.files }
}

/** state.json as read back; whatever can't be trusted is left out (a broken file is an empty state). */
export function parseState(value: unknown): OtaState {
  if (!value || typeof value !== 'object') return { bad: [] }
  const s = value as Record<string, unknown>
  const state: OtaState = { bad: Array.isArray(s.bad) ? s.bad.filter(isText) : [] }
  const t = s.target as Record<string, unknown> | undefined
  if (
    t &&
    typeof t === 'object' &&
    isText(t.build) &&
    BUILD_NAME.test(t.build) &&
    isCount(t.time) &&
    isText(t.dir) &&
    t.dir.startsWith('/') &&
    isCount(t.tries) &&
    typeof t.confirmed === 'boolean'
  ) {
    state.target = { build: t.build, time: t.time, dir: t.dir, tries: t.tries, confirmed: t.confirmed }
  }
  if (isCount(s.checkedAt)) state.checkedAt = s.checkedAt
  const cable = s.needsCable as Record<string, unknown> | undefined
  if (cable && typeof cable === 'object' && isText(cable.build) && isCount(cable.minNative)) {
    state.needsCable = { build: cable.build, minNative: cable.minNative }
  }
  if (isText(s.failed)) state.failed = s.failed
  return state
}

/** The state with a build added to the refused ones (and that target dropped, when it was the target). */
export function refuse(state: OtaState, build: string, failed: boolean): OtaState {
  const bad = [...state.bad.filter((name) => name !== build), build].slice(-MAX_BAD)
  const next: OtaState = { ...state, bad, failed: failed ? build : state.failed }
  if (next.target?.build === build) delete next.target
  return next
}

/** Looking for a new version, at most this often (a start or coming back to the app). */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

export const checkDue = (state: OtaState, now: number): boolean =>
  state.checkedAt === undefined || now - state.checkedAt >= CHECK_EVERY_MS || state.checkedAt > now

export type ManifestDecision =
  | { kind: 'invalid' }
  /** Not newer than the running version. */
  | { kind: 'current' }
  | { kind: 'refused' }
  /** Already downloaded and waiting (or running). */
  | { kind: 'ready' }
  | { kind: 'needsCable'; manifest: Manifest }
  | { kind: 'download'; manifest: Manifest }

/** What to do about the published manifest. */
export function decideManifest(raw: unknown, running: Running, state: OtaState, nativeLevel: number): ManifestDecision {
  const manifest = parseManifest(raw)
  if (!manifest) return { kind: 'invalid' }
  if (manifest.build === running.build || manifest.time <= running.time) return { kind: 'current' }
  if (state.bad.includes(manifest.build)) return { kind: 'refused' }
  if (state.target?.build === manifest.build) return { kind: 'ready' }
  if (manifest.minNative > nativeLevel) return { kind: 'needsCable', manifest }
  return { kind: 'download', manifest }
}

export type BootDecision =
  | { kind: 'none' }
  /** A newer APK was installed since it was downloaded: it's older than what runs. */
  | { kind: 'stale'; target: Target }
  /** Switched to twice and never confirmed: it doesn't start. */
  | { kind: 'failed'; target: Target }
  /** A workout is going on: the reload waits. */
  | { kind: 'wait' }
  | { kind: 'switch'; target: Target }

/** Whether this start (or the return to the app) switches to the downloaded version. */
export function decideBoot(state: OtaState, running: Running, liveWorkout: boolean): BootDecision {
  const target = state.target
  if (!target || target.build === running.build) return { kind: 'none' }
  if (target.time <= running.time) return { kind: 'stale', target }
  if (target.tries >= 2) return { kind: 'failed', target }
  if (liveWorkout) return { kind: 'wait' }
  return { kind: 'switch', target }
}

export type ConfirmDecision = { kind: 'none' } | { kind: 'keep'; target: Target } | { kind: 'rollback'; target: Target }

/** After a switch, once the app had time to come up: keep the new version, or go back. */
export function decideConfirm(state: OtaState, running: Running, healthy: boolean, basePath: string | undefined): ConfirmDecision {
  const target = state.target
  if (!target || target.build !== running.build || target.confirmed) return { kind: 'none' }
  if (!healthy) return { kind: 'rollback', target }
  // Served from somewhere else than its folder (it shouldn't happen): nothing to make permanent.
  if (basePath !== target.dir) return { kind: 'none' }
  return { kind: 'keep', target }
}

/** The folder name at the end of an absolute path. */
export const folderName = (path: string | undefined): string | undefined =>
  path?.replace(/\/+$/, '').split('/').pop() || undefined

/**
 * Which entries of bundles/ to delete: every folder but the ones still in use (the target and the one
 * the app runs from). state.json stays, and so does a half-written download while one is going on.
 */
export function cleanupPlan(entries: string[], keep: (string | undefined)[], downloading?: string): string[] {
  const kept = new Set(keep.filter((name): name is string => !!name))
  return entries.filter(
    (name) => name !== STATE_FILE && !kept.has(name) && (downloading === undefined || name !== `${downloading}.tmp`),
  )
}

export const STATE_FILE = 'state.json'

/** A zip entry's name that can only land inside the bundle's folder. */
export function isSafeEntryName(name: string): boolean {
  if (!name || name.length > 300) return false
  if (name.includes('\\') || name.includes('\0') || name.includes(':')) return false
  if (name.startsWith('/') || name.endsWith('/')) return false
  return name.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

/**
 * Bytes to base64 a piece at a time (String.fromCharCode over a whole file overflows the stack). Pieces
 * are a multiple of 3 bytes long, so their base64 strings join without padding in between.
 */
export function bytesToBase64(bytes: Uint8Array, chunk = 3 * 8192): string {
  const size = Math.max(3, chunk - (chunk % 3))
  const parts: string[] = []
  for (let start = 0; start < bytes.length; start += size) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(start, start + size))))
  }
  return parts.join('')
}

/** A file:// URI from the Filesystem plugin as the plain path the WebView serves from. */
export const uriToPath = (uri: string): string => decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '')

export const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
