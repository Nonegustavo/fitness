import { expect, it } from 'vitest'
import { nativeHash, readNativeLevel } from '../../scripts/native-hash.mjs'

it('native-level.json knows the current native code', () => {
  const { level, hash } = readNativeLevel()
  expect(Number.isInteger(level) && level >= 1, 'native-level.json: "level" must be a whole number from 1').toBe(true)
  expect(
    nativeHash(),
    [
      'The Android native side changed (Kotlin/Java, AndroidManifest.xml, build.gradle or a @capacitor/* version).',
      'Choose one:',
      '- the web code now needs the new native code: raise "level" in native-level.json (the phone stops',
      '  updating by itself until the new APK is installed by cable), then run node scripts/native-hash.mjs --write;',
      '- it does not, or it checks first that the feature exists: just run node scripts/native-hash.mjs --write.',
    ].join('\n'),
  ).toBe(hash)
})
