import { isSyncedTable, PULL_CURSOR, SYNCED_TABLES, type FitnessDB } from '../db/schema'
import type { Synced } from '../db/types'

/** A row as stored on the server: one generic table keyed by collection + id. */
export interface RemoteRecord {
  collection: string
  id: string
  data: Record<string, unknown>
  updated_at: number
  deleted: boolean
}

export interface PulledRecord extends RemoteRecord {
  /** Server-assigned sequence number, bumped on every write. */
  rev: number
}

export interface Remote {
  /** Stores records; the server keeps whichever version has the newest updated_at. */
  push(records: RemoteRecord[]): Promise<void>
  /** Records written after `afterRev`, oldest first. */
  pull(afterRev: number, limit: number): Promise<PulledRecord[]>
}

const PAGE_SIZE = 500

function toRemote(collection: string, row: Synced): RemoteRecord {
  const { id, updatedAt, deleted, dirty: _dirty, ...data } = row
  return { collection, id, data, updated_at: updatedAt, deleted: deleted === 1 }
}

function fromRemote(record: PulledRecord): Synced {
  return {
    ...record.data,
    id: record.id,
    updatedAt: record.updated_at,
    deleted: record.deleted ? 1 : 0,
    dirty: 0,
  }
}

export async function pushChanges(db: FitnessDB, remote: Remote): Promise<number> {
  let pushed = 0
  for (const name of SYNCED_TABLES) {
    const table = db.table<Synced, string>(name)
    const dirty = await table.where('dirty').equals(1).toArray()
    for (let i = 0; i < dirty.length; i += PAGE_SIZE) {
      const batch = dirty.slice(i, i + PAGE_SIZE)
      await remote.push(batch.map((row) => toRemote(name, row)))
      await db.transaction('rw', table, async () => {
        for (const row of batch) {
          // A row edited while the request was in flight stays dirty for the next round.
          const current = await table.get(row.id)
          if (current?.updatedAt === row.updatedAt) await table.update(row.id, { dirty: 0 })
        }
      })
      pushed += batch.length
    }
  }
  return pushed
}

export async function pullChanges(db: FitnessDB, remote: Remote): Promise<number> {
  const tables = SYNCED_TABLES.map((name) => db.table<Synced, string>(name))
  let cursor = Number((await db.meta.get(PULL_CURSOR))?.value ?? 0)
  let pulled = 0
  for (;;) {
    const page = await remote.pull(cursor, PAGE_SIZE)
    if (page.length === 0) break
    await db.transaction('rw', [...tables, db.meta], async () => {
      for (const record of page) {
        if (!isSyncedTable(record.collection)) continue
        const table = db.table<Synced, string>(record.collection)
        const local = await table.get(record.id)
        if (local && local.updatedAt > record.updated_at) continue // newer local edit, pushed next round
        if (local && local.updatedAt === record.updated_at) {
          if (local.dirty) await table.update(record.id, { dirty: 0 })
          continue
        }
        await table.put(fromRemote(record))
      }
      cursor = page[page.length - 1].rev
      await db.meta.put({ key: PULL_CURSOR, value: cursor })
    })
    pulled += page.length
    if (page.length < PAGE_SIZE) break
  }
  return pulled
}

/** Pushes local changes, then pulls everything the server has that this device hasn't seen. */
export async function syncOnce(db: FitnessDB, remote: Remote): Promise<{ pushed: number; pulled: number }> {
  const pushed = await pushChanges(db, remote)
  const pulled = await pullChanges(db, remote)
  return { pushed, pulled }
}

export async function countPending(db: FitnessDB): Promise<number> {
  let pending = 0
  for (const name of SYNCED_TABLES) pending += await db.table(name).where('dirty').equals(1).count()
  return pending
}
