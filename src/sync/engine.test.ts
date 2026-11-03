import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alive, patch, remove, save, type Draft } from '../db/repo'
import { FitnessDB, SETTINGS_ID } from '../db/schema'
import type { WeightEntry } from '../db/types'
import {
  batches,
  countPending,
  pullChanges,
  pushChanges,
  syncOnce,
  type PulledRecord,
  type Remote,
  type RemoteRecord,
} from './engine'

/** In-memory stand-in for the `records` table and the `push_records` function. */
class MemoryRemote implements Remote {
  rows = new Map<string, PulledRecord>()
  private rev = 0

  async push(records: RemoteRecord[]) {
    for (const record of records) {
      const key = `${record.collection}/${record.id}`
      const current = this.rows.get(key)
      if (current && current.updated_at >= record.updated_at) continue
      this.rows.set(key, { ...structuredClone(record), rev: ++this.rev })
    }
  }

  async pull(afterRev: number, limit: number) {
    return [...this.rows.values()]
      .filter((record) => record.rev > afterRev)
      .sort((a, b) => a.rev - b.rev)
      .slice(0, limit)
      .map((record) => structuredClone(record))
  }
}

let devices = 0
const newDevice = () => new FitnessDB(`device-${++devices}`)

const weight = (weightKg: number): Draft<WeightEntry> => ({
  date: '2026-11-02',
  time: 0,
  weightKg,
  source: 'manual',
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_000)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('sync', () => {
  it('copies a new row to the other device and clears the dirty flag', async () => {
    const remote = new MemoryRemote()
    const a = newDevice()
    const b = newDevice()
    const row = await save(a.weights, weight(82.5))

    await syncOnce(a, remote)
    await syncOnce(b, remote)

    expect(await b.weights.get(row.id)).toMatchObject({ weightKg: 82.5, dirty: 0, deleted: 0 })
    expect(await countPending(a)).toBe(0)
  })

  it('keeps the newest edit when both devices change the same row', async () => {
    const remote = new MemoryRemote()
    const a = newDevice()
    const b = newDevice()
    const row = await save(a.weights, weight(80))
    await syncOnce(a, remote)
    await syncOnce(b, remote)

    vi.setSystemTime(2_000)
    await patch(a.weights, row.id, { weightKg: 81 })
    vi.setSystemTime(3_000)
    await patch(b.weights, row.id, { weightKg: 79 })
    await syncOnce(a, remote)
    await syncOnce(b, remote)
    await syncOnce(a, remote)

    expect((await a.weights.get(row.id))?.weightKg).toBe(79)
    expect((await b.weights.get(row.id))?.weightKg).toBe(79)
  })

  it('does not let an older server version overwrite a newer local edit', async () => {
    const remote = new MemoryRemote()
    const a = newDevice()
    const b = newDevice()
    const row = await save(a.weights, weight(80))
    await syncOnce(a, remote)
    await syncOnce(b, remote)

    vi.setSystemTime(3_000)
    await patch(b.weights, row.id, { weightKg: 79 })
    vi.setSystemTime(2_000)
    await patch(a.weights, row.id, { weightKg: 81 })
    await syncOnce(a, remote)
    await pullChanges(b, remote)

    expect(await b.weights.get(row.id)).toMatchObject({ weightKg: 79, dirty: 1 })
    await pushChanges(b, remote)
    expect(remote.rows.get(`weights/${row.id}`)?.data.weightKg).toBe(79)
  })

  it('propagates deletions', async () => {
    const remote = new MemoryRemote()
    const a = newDevice()
    const b = newDevice()
    const row = await save(a.weights, weight(80))
    await syncOnce(a, remote)
    await syncOnce(b, remote)

    vi.setSystemTime(2_000)
    await remove(a.weights, row.id)
    await syncOnce(a, remote)
    await syncOnce(b, remote)

    expect((await b.weights.get(row.id))?.deleted).toBe(1)
    expect(alive(await b.weights.toArray())).toHaveLength(0)
  })

  it('keeps a row dirty when it changes while its push is in flight', async () => {
    const remote = new MemoryRemote()
    const a = newDevice()
    const row = await save(a.weights, weight(80))
    const slowRemote: Remote = {
      async push(records) {
        vi.setSystemTime(5_000)
        await patch(a.weights, row.id, { weightKg: 85 })
        await remote.push(records)
      },
      pull: (afterRev, limit) => remote.pull(afterRev, limit),
    }

    await syncOnce(a, slowRemote)
    expect(await a.weights.get(row.id)).toMatchObject({ weightKg: 85, dirty: 1 })

    await syncOnce(a, remote)
    expect(await countPending(a)).toBe(0)
    expect(remote.rows.get(`weights/${row.id}`)?.data.weightKg).toBe(85)
  })

  it('splits a push so large rows travel in several requests', async () => {
    const remote = new MemoryRemote()
    const sizes: number[] = []
    const counting: Remote = {
      async push(records) {
        sizes.push(records.length)
        await remote.push(records)
      },
      pull: (afterRev, limit) => remote.pull(afterRev, limit),
    }
    const a = newDevice()
    // About 120 kB of JSON each, like the samples of a long activity.
    const hr = Array.from({ length: 60_000 }, () => 1)
    for (let i = 0; i < 12; i++) await save(a.activityStreams, { id: `stream-${i}`, step: 1, hr })

    await pushChanges(a, counting)

    expect(sizes.length).toBeGreaterThan(1)
    expect(sizes.reduce((sum, n) => sum + n, 0)).toBe(12)
    expect(await countPending(a)).toBe(0)
  })

  it('merges habit logs for the same day from two devices into one row', async () => {
    const remote = new MemoryRemote()
    const a = newDevice()
    const b = newDevice()
    const log = { id: 'h1:2026-11-02', habitId: 'h1', date: '2026-11-02' }

    await save(a.habitLogs, { ...log, value: 1 })
    vi.setSystemTime(2_000)
    await save(b.habitLogs, { ...log, value: 0 })
    await syncOnce(a, remote)
    await syncOnce(b, remote)
    await syncOnce(a, remote)

    expect(await a.habitLogs.toArray()).toEqual([expect.objectContaining({ value: 0 })])
    expect(await b.habitLogs.toArray()).toEqual([expect.objectContaining({ value: 0 })])
  })

  it('replaces the seeded defaults with edits from another device', async () => {
    const remote = new MemoryRemote()
    const a = newDevice()
    const b = newDevice()
    expect((await b.settings.get(SETTINGS_ID))?.waterGoalMl).toBe(3000)

    await patch(a.settings, SETTINGS_ID, { waterGoalMl: 2500 })
    await syncOnce(a, remote)
    await syncOnce(b, remote)

    expect((await b.settings.get(SETTINGS_ID))?.waterGoalMl).toBe(2500)
    expect(await b.waterContainers.count()).toBe(3)
  })
})

describe('batches', () => {
  const row = '12345678' // 10 characters as JSON

  it('closes a batch at the row count or the byte budget', () => {
    expect(batches([row, row, row], 2, 1_000)).toEqual([[row, row], [row]])
    expect(batches([row, row, row], 500, 25)).toEqual([[row, row], [row]])
  })

  it('sends a row larger than the budget on its own', () => {
    expect(batches([row, 'x'.repeat(100), row], 500, 25)).toEqual([[row], ['x'.repeat(100)], [row]])
  })
})
