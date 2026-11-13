import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FitnessDB } from './schema'
import { deepFreeze, LINGER_MS, sharedStore } from './shared'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const

/** Waits until `check` passes (the live query answers on its own time). */
async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 5))
  expect(check()).toBe(true)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('sharedStore', () => {
  it('runs one query for many readers and hands them all the same object', async () => {
    const db = new FitnessDB('shared-one')
    await db.weights.put({ id: 'w1', date: '2026-11-01', time: 1, weightKg: 80, source: 'manual', ...meta })
    let runs = 0
    const query = async () => {
      runs += 1
      return db.weights.toArray()
    }
    const a = sharedStore('shared-one', query)
    const b = sharedStore('shared-one', query)
    expect(a).toBe(b)
    expect(a.getSnapshot().value).toBeUndefined()
    const seen: unknown[] = []
    const stopA = a.subscribe(() => seen.push(a.getSnapshot().value))
    const stopB = b.subscribe(() => seen.push(b.getSnapshot().value))
    await until(() => a.getSnapshot().value !== undefined)
    expect(runs).toBe(1)
    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(seen[1])

    // A change reaches both, still as one object.
    await db.weights.put({ id: 'w2', date: '2026-11-02', time: 2, weightKg: 79, source: 'manual', ...meta })
    await until(() => (a.getSnapshot().value?.length ?? 0) === 2)
    expect(runs).toBe(2)
    expect(seen.at(-1)).toBe(seen.at(-2))
    stopA()
    stopB()
  })

  it('freezes the answer in development, so changing it in place throws', async () => {
    const db = new FitnessDB('shared-frozen')
    await db.weights.put({ id: 'w1', date: '2026-11-01', time: 1, weightKg: 80, source: 'manual', ...meta })
    const store = sharedStore('shared-frozen', () => db.weights.toArray())
    const stop = store.subscribe(() => {})
    await until(() => store.getSnapshot().value !== undefined)
    const rows = store.getSnapshot().value!
    expect(() => rows.push(rows[0])).toThrow(TypeError)
    expect(() => {
      rows[0].weightKg = 70
    }).toThrow(TypeError)
    stop()
  })

  it('keeps the answer for a while after the last reader leaves, then stops and forgets it', async () => {
    const db = new FitnessDB('shared-linger')
    let runs = 0
    const query = async () => {
      runs += 1
      return db.weights.count()
    }
    const store = sharedStore('shared-linger', query)
    const stop = store.subscribe(() => {})
    await until(() => store.getSnapshot().value !== undefined)
    const before = runs
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stop()

    // A reader coming back within the linger gets the answer at once, from the same query.
    vi.advanceTimersByTime(LINGER_MS - 1000)
    const again = sharedStore('shared-linger', query)
    expect(again).toBe(store)
    expect(again.getSnapshot().value).toBe(0)
    const stopAgain = again.subscribe(() => {})
    vi.advanceTimersByTime(LINGER_MS * 2)
    expect(sharedStore('shared-linger', query)).toBe(store)
    stopAgain()

    vi.advanceTimersByTime(LINGER_MS)
    vi.useRealTimers()
    expect(runs).toBe(before)

    // After the linger: a new store, loading again from scratch.
    const fresh = sharedStore('shared-linger', query)
    expect(fresh).not.toBe(store)
    expect(fresh.getSnapshot().value).toBeUndefined()
    const stopFresh = fresh.subscribe(() => {})
    await until(() => fresh.getSnapshot().value !== undefined)
    expect(runs).toBe(before + 1)
    stopFresh()
  })

  it('reports a failed query', async () => {
    const store = sharedStore('shared-error', async () => {
      throw new Error('quebrou')
    })
    const stop = store.subscribe(() => {})
    await until(() => store.getSnapshot().failed)
    expect(store.getSnapshot().error).toEqual(new Error('quebrou'))
    stop()
  })
})

describe('deepFreeze', () => {
  it('freezes plain objects and arrays all the way down, and leaves typed arrays alone', () => {
    const value = deepFreeze({ list: [{ n: 1 }], bytes: new Uint8Array(2) })
    expect(Object.isFrozen(value.list[0])).toBe(true)
    expect(Object.isFrozen(value.bytes)).toBe(false)
  })
})
