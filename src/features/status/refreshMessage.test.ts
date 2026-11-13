import { describe, expect, it } from 'vitest'
import { refreshMessage, type RefreshOutcome } from './refreshMessage'

const fine: RefreshOutcome = { configured: true, signedIn: true, expired: false, garminBusy: false }

describe('refreshMessage', () => {
  it('says "Atualizado." only when everything worked', () => {
    expect(refreshMessage(fine)).toBe('Atualizado.')
  })

  it('asks to sign in when there is no account', () => {
    expect(refreshMessage({ ...fine, signedIn: false })).toBe('Entre na conta, em Ajustes, para sincronizar.')
    expect(refreshMessage({ ...fine, signedIn: false, expired: true })).toMatch(/sessão expirou/)
  })

  it('tells a failed sync with its message', () => {
    expect(refreshMessage({ ...fine, syncError: 'Sem conexão com o servidor.', garminError: { at: 1, message: 'x' } })).toBe(
      'Não deu para sincronizar: Sem conexão com o servidor.',
    )
  })

  it('tells a failed Garmin fetch after a good sync', () => {
    expect(refreshMessage({ ...fine, garminError: { at: 1, message: 'O Garmin não respondeu.' } })).toBe(
      'Sincronizado, mas o Garmin falhou: O Garmin não respondeu.',
    )
  })

  it('does not call a Garmin key not set up yet a failure', () => {
    expect(refreshMessage({ ...fine, garminError: { at: 1, message: 'x', missing: 'key' } })).toBe('Atualizado.')
  })

  it('says when Garmin is still fetching', () => {
    expect(refreshMessage({ ...fine, garminBusy: true })).toBe('Sincronizado. O Garmin ainda está buscando.')
  })

  it('says the data stays on the device without a project', () => {
    expect(refreshMessage({ ...fine, configured: false })).toBe('Os dados ficam só neste aparelho.')
  })
})
