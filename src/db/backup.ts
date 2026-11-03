import { notifyLocalChange } from './events'
import { alive } from './repo'
import { SYNCED_TABLES, type FitnessDB, type SyncedTableName } from './schema'
import type { Synced } from './types'

export interface BackupFile {
  app: 'fitness'
  version: 1
  exportedAt: string
  tables: Partial<Record<SyncedTableName, Omit<Synced, 'dirty'>[]>>
}

export async function exportBackup(db: FitnessDB): Promise<BackupFile> {
  const tables: BackupFile['tables'] = {}
  for (const name of SYNCED_TABLES) {
    const rows = alive(await db.table<Synced, string>(name).toArray())
    tables[name] = rows.map(({ dirty: _dirty, ...row }) => row)
  }
  return { app: 'fitness', version: 1, exportedAt: new Date().toISOString(), tables }
}

function isBackup(value: unknown): value is BackupFile {
  const file = value as BackupFile | null
  return file?.app === 'fitness' && file.version === 1 && typeof file.tables === 'object'
}

/** Merges a backup into the local data; rows already newer locally are kept. Returns rows written. */
export async function importBackup(db: FitnessDB, file: unknown): Promise<number> {
  if (!isBackup(file)) throw new Error('Este arquivo não é um backup deste app.')
  const tables = SYNCED_TABLES.map((name) => db.table<Synced, string>(name))
  let written = 0
  await db.transaction('rw', tables, async () => {
    for (const name of SYNCED_TABLES) {
      const table = db.table<Synced, string>(name)
      for (const row of file.tables[name] ?? []) {
        if (typeof row.id !== 'string' || typeof row.updatedAt !== 'number') continue
        const local = await table.get(row.id)
        if (local && local.updatedAt >= row.updatedAt) continue
        await table.put({ ...row, deleted: row.deleted === 1 ? 1 : 0, dirty: 1 })
        written++
      }
    }
  })
  if (written > 0) notifyLocalChange()
  return written
}
