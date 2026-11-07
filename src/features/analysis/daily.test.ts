import { describe, expect, it } from 'vitest'
import { insightWait } from './daily'

const signedIn = { configured: true, email: 'eu@exemplo.com', authChecked: true, auto: true, attempted: false }

describe('insightWait', () => {
  it("says the analysis is coming when it runs by itself and hasn't been tried today", () => {
    expect(insightWait(signedIn)).toBe('soon')
  })

  it('asks to sign in without an account, but not before the saved login was read', () => {
    expect(insightWait({ ...signedIn, configured: false })).toBe('signedOut')
    expect(insightWait({ ...signedIn, email: null })).toBe('signedOut')
    expect(insightWait({ ...signedIn, email: null, authChecked: false })).toBe('soon')
  })

  it("says it failed after today's automatic try or an error, and when the daily one is off", () => {
    expect(insightWait({ ...signedIn, attempted: true })).toBe('failed')
    expect(insightWait({ ...signedIn, error: 'A análise falhou.' })).toBe('failed')
    expect(insightWait({ ...signedIn, auto: false })).toBe('off')
    expect(insightWait({ ...signedIn, auto: false, error: 'Sem internet.' })).toBe('failed')
  })
})
