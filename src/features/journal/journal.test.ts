import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/schema'
import type { JournalEntry } from '../../db/types'
import { matchesSearch, saveJournal } from './journal'

const DAY = '2026-11-03'

describe('saveJournal', () => {
  beforeEach(() => db.journal.clear())

  it('changes one part of the entry and keeps the others', async () => {
    await saveJournal(DAY, { mood: 4 })
    await saveJournal(DAY, { text: 'Dormi mal, muito calor' })
    expect(await db.journal.get(DAY)).toMatchObject({ mood: 4, text: 'Dormi mal, muito calor', deleted: 0, dirty: 1 })
  })

  it('deletes an entry left empty, and does not create one from nothing', async () => {
    await saveJournal(DAY, { energy: 2 })
    await saveJournal(DAY, { energy: undefined })
    expect((await db.journal.get(DAY))?.deleted).toBe(1)
    await saveJournal('2026-11-04', { text: '  ' })
    expect(await db.journal.get('2026-11-04')).toBeUndefined()
  })
})

describe('matchesSearch', () => {
  const entry = { text: 'Viagem a São Paulo, reunião longa' } as JournalEntry
  it('ignores accents and case, and needs every word', () => {
    expect(matchesSearch(entry, 'sao paulo')).toBe(true)
    expect(matchesSearch(entry, 'REUNIAO viagem')).toBe(true)
    expect(matchesSearch(entry, 'viagem praia')).toBe(false)
  })
})
