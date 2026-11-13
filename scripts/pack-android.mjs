// Packs the Android build of the web app for the phone to download by itself (src/ota): a zip of the
// built folder and the manifest that describes it, published with the site under /fitness/android/.
// Usage: node scripts/pack-android.mjs dist-android dist/android
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { zipSync } from 'fflate'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('Uso: node scripts/pack-android.mjs <pasta do build> <pasta de saída>')
  process.exit(1)
}

/** Every file under the folder, as paths relative to it with forward slashes. */
function filesUnder(dir, prefix = '') {
  return readdirSync(join(input, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = prefix + entry.name
    return entry.isDirectory() ? filesUnder(join(dir, entry.name), `${path}/`) : [path]
  })
}

const { build, time, minNative } = JSON.parse(readFileSync(join(input, 'build.json'), 'utf8'))
if (!/^[A-Za-z0-9_-]{1,64}$/.test(build) || !Number.isFinite(time) || time <= 0) {
  console.error(`build.json sem commit ou hora: ${JSON.stringify({ build, time })}`)
  process.exit(1)
}

const paths = filesUnder('').sort()
if (!paths.includes('index.html')) {
  console.error(`${input} não tem index.html`)
  process.exit(1)
}
const zip = zipSync(Object.fromEntries(paths.map((path) => [path, readFileSync(join(input, path))])), { level: 9 })
const name = `bundle-${build}.zip`
const sha256 = createHash('sha256').update(zip).digest('hex')

mkdirSync(output, { recursive: true })
writeFileSync(join(output, name), zip)
const manifest = { build, time, minNative, zip: name, sha256, size: zip.length, files: paths.length }
writeFileSync(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`${name}: ${paths.length} arquivos, ${(zip.length / 1024).toFixed(0)} kB`)
