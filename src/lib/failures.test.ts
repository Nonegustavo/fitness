import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { failureMessage } from './failures'

describe('failureMessage', () => {
  it('speaks up when the local database fails', () => {
    expect(failureMessage(new Dexie.DatabaseClosedError('closed'))).toBe('Não foi possível salvar. Tente de novo.')
    expect(failureMessage(new Dexie.QuotaExceededError('full'))).toMatch(/Falta espaço/)
  })

  it('stays quiet about everything else', () => {
    expect(failureMessage(new DOMException('Share canceled', 'AbortError'))).toBeUndefined()
    expect(failureMessage(new Error('Failed to fetch'))).toBeUndefined()
    expect(failureMessage(undefined)).toBeUndefined()
  })
})
