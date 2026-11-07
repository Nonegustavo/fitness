import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { answerFor } from '../../db/hooks'
import { db } from '../../db/schema'
import type { JournalEntry } from '../../db/types'
import { journalEntry, matchesSearch, saveJournal } from './journal'

const DAY = '2026-11-03'

describe('the entry an editor starts from', () => {
  beforeEach(() => db.journal.clear())

  it("is the day's own: right after switching days, the previous day's answer counts as still loading", async () => {
    await saveJournal(DAY, { text: 'Dia 3' })
    const before = { key: DAY, value: await journalEntry(DAY) }
    // What the live query still holds for a moment after the editor moved to the 4th.
    expect(answerFor(before, '2026-11-04')).toBeUndefined()
    expect(answerFor({ key: '2026-11-04', value: await journalEntry('2026-11-04') }, '2026-11-04')).toBeNull()
    expect(answerFor(before, DAY)?.text).toBe('Dia 3')
    expect(answerFor(undefined, DAY)).toBeUndefined()
  })

  it('is null for a day emptied out', async () => {
    await saveJournal(DAY, { mood: 3 })
    await saveJournal(DAY, { mood: undefined })
    expect(await journalEntry(DAY)).toBeNull()
  })
})

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
