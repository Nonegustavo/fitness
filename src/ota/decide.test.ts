import { describe, expect, it } from 'vitest'
import {
  bytesToBase64,
  checkDue,
  CHECK_EVERY_MS,
  cleanupPlan,
  decideBoot,
  decideConfirm,
  decideManifest,
  folderName,
  isSafeEntryName,
  parseState,
  refuse,
  uriToPath,
  type OtaState,
  type Target,
} from './decide'

const running = { build: 'aaa1111', time: 1000 }
const manifest = {
  build: 'bbb2222',
  time: 2000,
  minNative: 1,
  zip: 'bundle-bbb2222.zip',
  sha256: 'a'.repeat(64),
  size: 900_000,
  files: 110,
}
const state = (extra: Partial<OtaState> = {}): OtaState => ({ bad: [], ...extra })
const target = (extra: Partial<Target> = {}): Target => ({
  build: 'bbb2222',
  time: 2000,
  dir: '/data/user/0/app/files/bundles/bbb2222',
  tries: 0,
  confirmed: false,
  ...extra,
})

describe('decideManifest', () => {
  it('downloads a newer version the APK can run', () => {
    expect(decideManifest(manifest, running, state(), 1)).toEqual({ kind: 'download', manifest })
  })

  it('leaves the same or an older version alone', () => {
    expect(decideManifest({ ...manifest, build: running.build }, running, state(), 1).kind).toBe('current')
    expect(decideManifest({ ...manifest, time: running.time }, running, state(), 1).kind).toBe('current')
    expect(decideManifest({ ...manifest, time: 500 }, running, state(), 1).kind).toBe('current')
  })

  it('never takes a refused version again', () => {
    expect(decideManifest(manifest, running, state({ bad: ['bbb2222'] }), 1).kind).toBe('refused')
  })

  it("doesn't download what is already waiting", () => {
    expect(decideManifest(manifest, running, state({ target: target() }), 1).kind).toBe('ready')
  })

  it('says when the version needs a newer APK', () => {
    expect(decideManifest({ ...manifest, minNative: 2 }, running, state(), 1)).toEqual({
      kind: 'needsCable',
      manifest: { ...manifest, minNative: 2 },
    })
  })

  it('ignores a malformed manifest', () => {
    for (const bad of [
      null,
      'text',
      {},
      { ...manifest, build: '../x' },
      { ...manifest, time: '2000' },
      { ...manifest, size: 0 },
      { ...manifest, zip: '../bundle-x.zip' },
      { ...manifest, sha256: 'xyz' },
      { ...manifest, minNative: -1 },
    ]) {
      expect(decideManifest(bad, running, state(), 1).kind).toBe('invalid')
    }
  })
})

describe('decideBoot', () => {
  it('does nothing without a target, or when the target is what runs', () => {
    expect(decideBoot(state(), running, false).kind).toBe('none')
    expect(decideBoot(state({ target: target() }), { build: 'bbb2222', time: 2000 }, false).kind).toBe('none')
  })

  it('drops a target older than a newly installed APK', () => {
    expect(decideBoot(state({ target: target() }), { build: 'ccc3333', time: 3000 }, false).kind).toBe('stale')
    expect(decideBoot(state({ target: target({ time: 1000 }) }), running, false).kind).toBe('stale')
  })

  it('gives up on a version switched to twice without starting', () => {
    expect(decideBoot(state({ target: target({ tries: 2 }) }), running, false).kind).toBe('failed')
  })

  it('waits for the workout to end', () => {
    expect(decideBoot(state({ target: target({ tries: 1 }) }), running, true).kind).toBe('wait')
  })

  it('switches otherwise', () => {
    expect(decideBoot(state({ target: target({ tries: 1 }) }), running, false)).toEqual({
      kind: 'switch',
      target: target({ tries: 1 }),
    })
  })
})

describe('decideConfirm', () => {
  const now = { build: 'bbb2222', time: 2000 }
  const dir = target().dir

  it('keeps a new version that came up', () => {
    expect(decideConfirm(state({ target: target() }), now, true, dir)).toEqual({ kind: 'keep', target: target() })
  })

  it('goes back from one that did not', () => {
    expect(decideConfirm(state({ target: target() }), now, false, dir).kind).toBe('rollback')
  })

  it('does nothing when already confirmed, for another build, or served from elsewhere', () => {
    expect(decideConfirm(state({ target: target({ confirmed: true }) }), now, true, dir).kind).toBe('none')
    expect(decideConfirm(state({ target: target() }), running, false, dir).kind).toBe('none')
    expect(decideConfirm(state(), now, false, dir).kind).toBe('none')
    expect(decideConfirm(state({ target: target() }), now, true, 'public').kind).toBe('none')
  })
})

describe('cleanupPlan', () => {
  it('deletes every folder but the ones in use, and keeps the state', () => {
    expect(cleanupPlan(['state.json', 'aaa', 'bbb', 'ccc', 'ddd.tmp'], ['bbb', undefined])).toEqual(['aaa', 'ccc', 'ddd.tmp'])
    expect(cleanupPlan(['state.json', 'aaa', 'bbb'], ['bbb', 'aaa'])).toEqual([])
  })

  it('leaves a download in progress alone', () => {
    expect(cleanupPlan(['aaa', 'ddd.tmp'], [], 'ddd')).toEqual(['aaa'])
  })

  it('names the folder of a served path', () => {
    expect(folderName('/data/user/0/app/files/bundles/bbb2222/')).toBe('bbb2222')
    expect(folderName('public')).toBe('public')
    expect(folderName(undefined)).toBeUndefined()
  })
})

describe('isSafeEntryName', () => {
  it('takes plain relative paths', () => {
    expect(isSafeEntryName('index.html')).toBe(true)
    expect(isSafeEntryName('assets/index-abc.js')).toBe(true)
    expect(isSafeEntryName('.well-known/x')).toBe(true)
  })

  it('refuses anything that could leave the folder', () => {
    for (const name of ['', '/etc/passwd', '../x', 'a/../../x', 'a/./b', 'a\\b', 'C:/x', 'c:x', 'a//b', 'dir/', 'a\0b']) {
      expect(isSafeEntryName(name), name).toBe(false)
    }
  })
})

describe('bytesToBase64', () => {
  it('matches a one-piece encoding whatever the piece size', () => {
    const bytes = Uint8Array.from({ length: 100_001 }, (_, i) => (i * 31) % 256)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const expected = btoa(binary)
    expect(bytesToBase64(bytes)).toBe(expected)
    expect(bytesToBase64(bytes, 7)).toBe(expected)
    expect(bytesToBase64(bytes, 3)).toBe(expected)
    expect(bytesToBase64(new Uint8Array())).toBe('')
  })
})

describe('state', () => {
  it('reads back what was written and drops what is broken', () => {
    const written = state({ target: target(), checkedAt: 5, needsCable: { build: 'x', minNative: 2 }, bad: ['z'], failed: 'z' })
    expect(parseState(JSON.parse(JSON.stringify(written)))).toEqual(written)
    expect(parseState('nonsense')).toEqual({ bad: [] })
    expect(parseState({ bad: [1, 'a'], target: { ...target(), dir: 'relative' } })).toEqual({ bad: ['a'] })
  })

  it('refusing a build drops it as the target and remembers it', () => {
    expect(refuse(state({ target: target(), bad: ['old'] }), 'bbb2222', true)).toEqual({
      bad: ['old', 'bbb2222'],
      failed: 'bbb2222',
    })
    expect(refuse(state({ bad: Array.from({ length: 25 }, (_, i) => `b${i}`) }), 'new', false).bad).toHaveLength(20)
  })

  it('looks again after six hours', () => {
    expect(checkDue(state(), 10)).toBe(true)
    expect(checkDue(state({ checkedAt: 10 }), 10 + CHECK_EVERY_MS - 1)).toBe(false)
    expect(checkDue(state({ checkedAt: 10 }), 10 + CHECK_EVERY_MS)).toBe(true)
    // A clock set back: look anyway.
    expect(checkDue(state({ checkedAt: 10 }), 5)).toBe(true)
  })

  it('turns a file URI into the path the WebView serves', () => {
    expect(uriToPath('file:///data/user/0/io.github.nonegustavo.fitness/files/bundles/abc/')).toBe(
      '/data/user/0/io.github.nonegustavo.fitness/files/bundles/abc',
    )
  })
})
