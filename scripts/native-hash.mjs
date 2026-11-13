// The fingerprint of the Android app's native side (src/ota/nativeLevel.test.ts compares it with
// native-level.json, so a change to Kotlin/Java, the manifest, Gradle or a Capacitor version is never
// published without deciding whether the web code now needs a new APK).
// Usage: node scripts/native-hash.mjs          prints the current hash
//        node scripts/native-hash.mjs --write  stores it in native-level.json
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LEVEL_FILE = join(ROOT, 'native-level.json')

const NATIVE_DIR = 'android/app/src/main/java'
const NATIVE_FILES = ['android/app/src/main/AndroidManifest.xml', 'android/app/build.gradle']

function filesUnder(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

/** sha256 over the native sources (CRLF on Windows, LF in CI: both hash the same) and the Capacitor versions. */
export function nativeHash() {
  const hash = createHash('sha256')
  const paths = [...filesUnder(NATIVE_DIR), ...NATIVE_FILES].sort()
  for (const path of paths) {
    const text = readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n')
    hash.update(`${path}\n${text}\n`)
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const capacitor = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
    .filter(([name]) => name.startsWith('@capacitor/'))
    .map(([name, version]) => `${name}@${version}`)
    .sort()
  hash.update(capacitor.join('\n'))
  return hash.digest('hex')
}

/** What native-level.json holds now. */
export function readNativeLevel() {
  return JSON.parse(readFileSync(LEVEL_FILE, 'utf8'))
}

if (process.argv[1] && relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  const hash = nativeHash()
  if (process.argv.includes('--write')) {
    const current = readNativeLevel()
    writeFileSync(LEVEL_FILE, `${JSON.stringify({ ...current, hash }, null, 2)}\n`)
    console.log(`native-level.json: level ${current.level}, hash ${hash}`)
  } else {
    console.log(hash)
  }
}
