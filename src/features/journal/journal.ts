import { useLiveQuery } from 'dexie-react-hooks'
import { notifyLocalChange } from '../../db/events'
import { useKeyedLiveQuery } from '../../db/hooks'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import type { JournalEntry } from '../../db/types'
import type { DayKey } from '../../lib/dates'

export interface Level {
  value: number
  emoji: string
  label: string
}

export const MOODS: Level[] = [
  { value: 1, emoji: '😞', label: 'Muito ruim' },
  { value: 2, emoji: '😕', label: 'Ruim' },
  { value: 3, emoji: '😐', label: 'Normal' },
  { value: 4, emoji: '🙂', label: 'Bom' },
  { value: 5, emoji: '😄', label: 'Ótimo' },
]

export const ENERGY: Level[] = [
  { value: 1, emoji: '🪫', label: 'Esgotado' },
  { value: 2, emoji: '😴', label: 'Cansado' },
  { value: 3, emoji: '🙂', label: 'Normal' },
  { value: 4, emoji: '💪', label: 'Disposto' },
  { value: 5, emoji: '⚡', label: 'Elétrico' },
]

export const levelOf = (levels: Level[], value?: number) => levels.find((level) => level.value === value)

/** The day's entry, or null when there is none. */
export async function journalEntry(date: DayKey): Promise<JournalEntry | null> {
  const entry = await db.journal.get(date)
  return entry && !entry.deleted ? entry : null
}

/**
 * The day's entry: undefined while loading (also right after the day changes, never the previous
 * day's entry), null when there is none.
 */
export const useJournalEntry = (date: DayKey) => useKeyedLiveQuery(date, () => journalEntry(date))

/** Every entry, newest first. */
export const useJournal = () =>
  useLiveQuery(async () => alive(await db.journal.toArray()).sort((a, b) => b.id.localeCompare(a.id)))

type Changes = Partial<Pick<JournalEntry, 'text' | 'mood' | 'energy'>>

/**
 * Changes part of a day's entry, keeping the rest. An entry left with no text, mood or energy is
 * deleted, so the history only lists days that have something.
 */
export async function saveJournal(date: DayKey, changes: Changes): Promise<void> {
  await db.transaction('rw', db.journal, async () => {
    const current = await db.journal.get(date)
    const base = current && !current.deleted ? current : undefined
    const next = { text: base?.text ?? '', mood: base?.mood, energy: base?.energy, ...changes }
    const empty = next.text.trim() === '' && next.mood === undefined && next.energy === undefined
    if (empty && !base) return
    await db.journal.put({ id: date, ...next, updatedAt: Date.now(), deleted: empty ? 1 : 0, dirty: 1 })
  })
  notifyLocalChange()
}

/** Text search that ignores accents and case. */
export function matchesSearch(entry: JournalEntry, query: string): boolean {
  const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const words = normalize(query).split(/\s+/).filter(Boolean)
  const text = normalize(entry.text)
  return words.every((word) => text.includes(word))
}
