import { describe, expect, it } from 'vitest'
import { needsAttention, sourceHealth, whenText, worstLevel, worstSource, type HealthInputs, type SourceId } from './health'

const NOW = new Date(2026, 10, 12, 9, 0).getTime()
const MIN = 60_000
const HOUR = 60 * MIN

const fine = (): HealthInputs => ({
  sync: {
    configured: true,
    authChecked: true,
    signedIn: true,
    expired: false,
    phase: 'idle',
    online: true,
    lastOkAt: NOW - MIN,
    pending: 0,
  },
  garmin: { syncing: false, lastOkAt: NOW - HOUR },
  sisrun: { fetchedAt: NOW - 2 * HOUR },
  photos: { count: 0 },
})

const entry = (inputs: HealthInputs, id: SourceId) => sourceHealth(inputs, NOW).find((source) => source.id === id)!

describe('sourceHealth', () => {
  it('is all ok when everything worked, and says when', () => {
    const entries = sourceHealth(fine(), NOW)
    expect(entries.map((source) => source.id)).toEqual(['sync', 'garmin', 'sisrun', 'photos'])
    expect(entries.every((source) => source.level === 'ok')).toBe(true)
    expect(entries[0].text).toBe('Sincronizado hoje, 08:59')
    expect(worstLevel(entries)).toBe('ok')
  })

  it('lists Health Connect and the app update only when given', () => {
    const inputs = { ...fine(), healthConnect: { availability: 'available' as const, granted: true, busy: false, lastOkAt: NOW }, update: { needsCable: false } }
    expect(sourceHealth(inputs, NOW).map((source) => source.id)).toEqual(['sync', 'garmin', 'healthConnect', 'sisrun', 'photos', 'update'])
  })

  describe('sync', () => {
    it('is off without a project or before signing in', () => {
      expect(entry({ ...fine(), sync: { ...fine().sync, configured: false } }, 'sync')).toMatchObject({ level: 'off', text: 'Só neste aparelho' })
      expect(entry({ ...fine(), sync: { ...fine().sync, signedIn: false } }, 'sync')).toMatchObject({
        level: 'off',
        text: 'Entre para sincronizar',
        action: 'signIn',
      })
    })

    it('is an error when the session expired or the sync failed', () => {
      expect(entry({ ...fine(), sync: { ...fine().sync, signedIn: false, expired: true } }, 'sync')).toMatchObject({
        level: 'error',
        action: 'signIn',
      })
      const failed = entry({ ...fine(), sync: { ...fine().sync, phase: 'error', error: 'Erro ao sincronizar.', errorDetail: 'boom' } }, 'sync')
      expect(failed).toMatchObject({ level: 'error', text: 'Erro ao sincronizar.', detail: 'boom', action: 'sync' })
    })

    it('warns when offline with pending records, not without', () => {
      expect(entry({ ...fine(), sync: { ...fine().sync, phase: 'offline', pending: 3 } }, 'sync')).toMatchObject({
        level: 'warn',
        text: 'Sem internet · 3 pendentes',
      })
      expect(entry({ ...fine(), sync: { ...fine().sync, online: false } }, 'sync').level).toBe('ok')
    })

    it('warns when records wait and the last success is over 10 minutes old', () => {
      expect(entry({ ...fine(), sync: { ...fine().sync, pending: 1 } }, 'sync').level).toBe('ok')
      expect(entry({ ...fine(), sync: { ...fine().sync, pending: 1, lastOkAt: NOW - 11 * MIN } }, 'sync')).toMatchObject({
        level: 'warn',
        text: '1 pendente sem sincronizar',
      })
    })
  })

  describe('Garmin', () => {
    it('is off when signed out or the key is missing', () => {
      expect(entry({ ...fine(), sync: { ...fine().sync, signedIn: false } }, 'garmin').level).toBe('off')
      const noKey = { syncing: false, lastError: { at: NOW, message: 'x', missing: 'key' as const } }
      expect(entry({ ...fine(), garmin: noKey }, 'garmin')).toMatchObject({ level: 'off', action: 'setup' })
    })

    it('is an error only when the last attempt failed after the last success', () => {
      const failed = { syncing: false, lastOkAt: NOW - 5 * HOUR, lastError: { at: NOW - HOUR, message: 'O Garmin não respondeu.' } }
      expect(entry({ ...fine(), garmin: failed }, 'garmin')).toMatchObject({
        level: 'error',
        text: 'A última busca falhou',
        detail: 'O Garmin não respondeu.',
        lastOkAt: NOW - 5 * HOUR,
      })
      const solved = { ...failed, lastOkAt: NOW - 10 * MIN }
      expect(entry({ ...fine(), garmin: solved }, 'garmin').level).toBe('ok')
    })

    it('warns after 48 hours without a success', () => {
      expect(entry({ ...fine(), garmin: { syncing: false, lastOkAt: NOW - 47 * HOUR } }, 'garmin').level).toBe('ok')
      expect(entry({ ...fine(), garmin: { syncing: false, lastOkAt: NOW - 49 * HOUR } }, 'garmin').level).toBe('warn')
    })
  })

  describe('Health Connect', () => {
    const hc = { availability: 'available' as const, granted: true, busy: false, lastOkAt: NOW - HOUR }
    const of = (changes: object) => entry({ ...fine(), healthConnect: { ...hc, ...changes } }, 'healthConnect')

    it('is off when unavailable and warns without permission', () => {
      expect(of({ availability: 'unavailable' }).level).toBe('off')
      expect(of({ granted: false })).toMatchObject({ level: 'warn', action: 'setup' })
    })

    it('is an error when the last import failed after the last success', () => {
      expect(of({ lastError: { at: NOW, message: 'x' } })).toMatchObject({ level: 'error', action: 'healthConnect' })
      expect(of({ lastError: { at: NOW - 2 * HOUR, message: 'x' } }).level).toBe('ok')
    })
  })

  describe('SisRUN', () => {
    it('is off when never read or the secrets are missing', () => {
      expect(entry({ ...fine(), sisrun: {} }, 'sisrun').level).toBe('off')
      expect(entry({ ...fine(), sisrun: { error: { at: NOW, message: 'x', missing: true } } }, 'sisrun').level).toBe('off')
    })

    it('is an error when the error came after the last read', () => {
      expect(entry({ ...fine(), sisrun: { fetchedAt: NOW - HOUR, error: { at: NOW, message: 'x' } } }, 'sisrun')).toMatchObject({
        level: 'error',
        action: 'sisrun',
      })
      expect(entry({ ...fine(), sisrun: { fetchedAt: NOW, error: { at: NOW - HOUR, message: 'x' } } }, 'sisrun').level).toBe('ok')
    })
  })

  describe('photos', () => {
    it('warns when the oldest pending photo waits for more than an hour', () => {
      expect(entry({ ...fine(), photos: { count: 3, oldestAt: NOW - 10 * MIN } }, 'photos').level).toBe('ok')
      expect(entry({ ...fine(), photos: { count: 3, oldestAt: NOW - 2 * HOUR } }, 'photos')).toMatchObject({
        level: 'warn',
        text: '3 fotos esperando envio',
        action: 'photos',
      })
    })
  })

  it('warns when a new version needs the cable', () => {
    expect(entry({ ...fine(), update: { needsCable: true } }, 'update')).toMatchObject({
      level: 'warn',
      text: 'Há uma versão nova que precisa ser instalada pelo cabo.',
    })
  })
})

describe('worst level', () => {
  it('picks the first of the worst level', () => {
    const entries = sourceHealth(
      {
        ...fine(),
        garmin: { syncing: false, lastOkAt: NOW - 49 * HOUR },
        sisrun: { fetchedAt: NOW - HOUR, error: { at: NOW, message: 'x' } },
      },
      NOW,
    )
    expect(worstSource(entries)?.id).toBe('sisrun')
    expect(worstLevel(entries)).toBe('error')
    expect(needsAttention('error') && needsAttention('warn') && !needsAttention('off') && !needsAttention('ok')).toBe(true)
  })

  it('is off with nothing to look at', () => {
    expect(worstLevel([])).toBe('off')
  })
})

describe('whenText', () => {
  it('says the day and the time', () => {
    expect(whenText(NOW - 30 * MIN, NOW)).toBe('hoje, 08:30')
    expect(whenText(new Date(2026, 10, 11, 22, 40).getTime(), NOW)).toBe('ontem, 22:40')
  })
})
