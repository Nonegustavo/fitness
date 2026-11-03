import type { Table, UpdateSpec } from 'dexie'
import { newId } from '../lib/ids'
import { notifyLocalChange } from './events'
import type { Synced } from './types'

export type Draft<T extends Synced> = Omit<T, keyof Synced> & { id?: string }

/** Inserts or replaces a row and marks it for sync. */
export async function save<T extends Synced>(table: Table<T, string>, draft: Draft<T>): Promise<T> {
  const row = { ...draft, id: draft.id ?? newId(), updatedAt: Date.now(), deleted: 0, dirty: 1 } as T
  await table.put(row)
  notifyLocalChange()
  return row
}

/** Changes some fields of a row and marks it for sync. */
export async function patch<T extends Synced>(
  table: Table<T, string>,
  id: string,
  changes: Partial<Omit<T, keyof Synced>>,
): Promise<void> {
  await table.update(id, { ...changes, updatedAt: Date.now(), dirty: 1 } as unknown as UpdateSpec<T>)
  notifyLocalChange()
}

/** Read-modify-write of one row inside a transaction, marking it for sync. */
export async function mutate<T extends Synced>(
  table: Table<T, string>,
  id: string,
  change: (row: T) => T,
): Promise<T | undefined> {
  const updated = await table.db.transaction('rw', table, async () => {
    const row = await table.get(id)
    if (!row) return undefined
    const next = { ...change(row), id, updatedAt: Date.now(), dirty: 1 } as T
    await table.put(next)
    return next
  })
  if (updated) notifyLocalChange()
  return updated
}

/** Soft-deletes a row, so the deletion also reaches the other devices. */
export async function remove<T extends Synced>(table: Table<T, string>, id: string): Promise<void> {
  await table.update(id, { deleted: 1, updatedAt: Date.now(), dirty: 1 } as unknown as UpdateSpec<T>)
  notifyLocalChange()
}

export const alive = <T extends Synced>(rows: T[]): T[] => rows.filter((row) => row.deleted === 0)
