import { describe, expect, it } from 'vitest'
import { describeSyncError, isConnectionError } from './errors'

describe('describeSyncError', () => {
  it('names a wrong e-mail or password', () => {
    expect(describeSyncError(new Error('Invalid login credentials'))).toEqual({ message: 'E-mail ou senha incorretos.' })
  })

  it('reads every browser’s way of saying the server could not be reached', () => {
    for (const raw of [
      'Failed to fetch',
      'TypeError: Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
      'fetch failed',
    ]) {
      expect(describeSyncError(raw).message).toBe('Sem conexão com o servidor.')
    }
  })

  it('reads an expired or invalid session', () => {
    for (const raw of ['JWT expired', 'invalid JWT: unable to parse', 'Invalid Refresh Token: Refresh Token Not Found', 'Auth session missing!']) {
      expect(describeSyncError(raw).message).toBe('Sua sessão expirou. Entre de novo.')
    }
  })

  it('reads a paused project and too many attempts', () => {
    expect(describeSyncError('Project is paused').message).toMatch(/pausado/)
    expect(describeSyncError('Request rate limit reached').message).toMatch(/Muitas tentativas/)
    expect(describeSyncError('Too Many Requests').message).toMatch(/Muitas tentativas/)
  })

  it('keeps an unknown message as the detail', () => {
    expect(describeSyncError(new Error('relation "records" does not exist'))).toEqual({
      message: 'Erro ao sincronizar.',
      detail: 'relation "records" does not exist',
    })
    expect(describeSyncError('boom', 'Não deu para entrar.')).toEqual({ message: 'Não deu para entrar.', detail: 'boom' })
  })

  it('has no detail when there is no text', () => {
    expect(describeSyncError('')).toEqual({ message: 'Erro ao sincronizar.' })
  })
})

describe('isConnectionError', () => {
  it('tells a server out of reach from a server that answered', () => {
    expect(isConnectionError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isConnectionError(new Error('The object exceeded the maximum allowed size'))).toBe(false)
  })
})
