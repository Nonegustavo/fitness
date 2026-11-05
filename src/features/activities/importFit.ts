import { unzipSync } from 'fflate'
import { notifyLocalChange } from '../../db/events'
import { db } from '../../db/schema'
import type { Activity } from '../../db/types'
import { parseFit, type ParsedFit } from './fit'

export interface ImportResult {
  /** Ids of the activities written, in file order. */
  imported: string[]
  failed: { name: string; reason: string }[]
}

const isZip = (name: string) => name.toLowerCase().endsWith('.zip')
const isFit = (name: string) => name.toLowerCase().endsWith('.fit')

/** The .fit files in a download: the file itself, or each one inside a .zip. */
export function fitEntries(name: string, bytes: Uint8Array): { name: string; bytes: Uint8Array }[] {
  if (!isZip(name)) return [{ name, bytes }]
  return Object.entries(unzipSync(bytes, { filter: (entry) => isFit(entry.name) })).map(([path, data]) => ({
    name: path.split('/').pop() ?? path,
    bytes: data,
  }))
}

/** Writes an activity and its samples together, marked for sync; `extra` adds what the API knows. */
export async function saveParsed(
  { activity, stream }: ParsedFit,
  extra: Partial<Pick<Activity, 'garminId' | 'title' | 'workout'>> = {},
): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.activities, db.activityStreams, async () => {
    // Importing the file again keeps what the user said about the workout.
    const previous = await db.activities.get(activity.id)
    const said = previous && !previous.deleted ? { effort: previous.effort, discomfort: previous.discomfort, notes: previous.notes } : {}
    await db.activities.put({ ...activity, ...extra, ...said, updatedAt: now, deleted: 0, dirty: 1 })
    await db.activityStreams.put({ ...stream, updatedAt: now, deleted: 0, dirty: 1 })
  })
}

/**
 * Imports .fit files, also from inside .zip files (Garmin Connect's "Exportar original" downloads one).
 * Importing the same file again replaces the activity.
 */
export async function importFitFiles(files: File[]): Promise<ImportResult> {
  const result: ImportResult = { imported: [], failed: [] }
  for (const file of files) {
    let entries: { name: string; bytes: Uint8Array }[]
    try {
      entries = fitEntries(file.name, new Uint8Array(await file.arrayBuffer()))
      if (entries.length === 0) throw new Error('Nenhum .fit dentro do .zip.')
    } catch (error) {
      result.failed.push({ name: file.name, reason: error instanceof Error ? error.message : String(error) })
      continue
    }
    for (const entry of entries) {
      try {
        const parsed = parseFit(entry.bytes, entry.name)
        await saveParsed(parsed)
        result.imported.push(parsed.activity.id)
      } catch (error) {
        result.failed.push({ name: entry.name, reason: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  if (result.imported.length > 0) notifyLocalChange()
  return result
}
