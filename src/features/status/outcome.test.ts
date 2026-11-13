import { describe, expect, it } from 'vitest'
import { currentError, lastSuccess, recordFailure, recordSuccess, type Outcome } from './outcome'

/** Like Garmin's meta: the outcome among other bookkeeping. */
type Meta = Outcome & { lastRunAt?: number; historyFrom?: string }

describe('source outcome', () => {
  it('keeps the last success when a run fails, and the error until one works', () => {
    const ok = recordSuccess<Meta>({ lastRunAt: 1000, historyFrom: '2026-10-01' }, 1000)
    expect(ok).toEqual({ lastRunAt: 1000, historyFrom: '2026-10-01', lastOkAt: 1000 })

    const failed = recordFailure({ ...ok, lastRunAt: 2000 }, { at: 2000, message: 'O Garmin não respondeu.', status: 504 })
    expect(failed).toMatchObject({ lastRunAt: 2000, lastOkAt: 1000, lastError: { at: 2000, status: 504 } })
    expect(lastSuccess(failed)).toBe(1000)
    expect(currentError(failed)?.message).toBe('O Garmin não respondeu.')

    const again = recordSuccess({ ...failed, lastRunAt: 3000 }, 3000)
    expect(again).toEqual({ lastRunAt: 3000, historyFrom: '2026-10-01', lastOkAt: 3000 })
    expect(currentError(again)).toBeUndefined()
  })

  it('treats a meta from before the outcome was kept as a success at its last run', () => {
    expect(lastSuccess({ lastRunAt: 500 })).toBe(500)
    expect(lastSuccess({})).toBeUndefined()
  })

  it('never takes a failed attempt for a success', () => {
    const failed = recordFailure<Meta>({ lastRunAt: 700 }, { at: 700, message: 'x', missing: 'key' })
    expect(lastSuccess(failed)).toBeUndefined()
    expect(currentError(failed)?.missing).toBe('key')
  })

  it('ignores an error older than the last success', () => {
    expect(currentError({ lastOkAt: 2000, lastError: { at: 1000, message: 'old' } })).toBeUndefined()
  })
})
