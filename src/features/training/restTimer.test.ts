import { afterEach, describe, expect, it, vi } from 'vitest'
import { alertRestOver, getRestTimer, setRest, setRestAlertGate, stopRest, subscribeRestTimer } from './restTimer'

afterEach(() => {
  stopRest()
  setRestAlertGate(() => true)
  vi.unstubAllGlobals()
})

describe('setRest', () => {
  it('takes the rest as the notification left it, once, and no rest already over', () => {
    const changes = vi.fn()
    const unsubscribe = subscribeRestTimer(changes)
    const rest = { endsAt: Date.now() + 60_000, totalSec: 90, label: 'Supino reto' }
    setRest(rest)
    setRest({ ...rest })
    expect(getRestTimer()).toEqual(rest)
    expect(changes).toHaveBeenCalledTimes(1)
    setRest({ ...rest, endsAt: Date.now() - 1 })
    expect(getRestTimer()).toBeNull()
    setRest(null)
    expect(changes).toHaveBeenCalledTimes(2)
    unsubscribe()
  })
})

describe('alertRestOver', () => {
  it('rings only when the gate lets it, asking about the rest that ended', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    const rest = { endsAt: Date.now() + 1_000, totalSec: 60, label: 'Remada' }
    setRest(rest)
    const asked: number[] = []
    setRestAlertGate((endsAt) => {
      asked.push(endsAt)
      return false
    })
    alertRestOver()
    expect(vibrate).not.toHaveBeenCalled()
    setRestAlertGate(() => true)
    alertRestOver()
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(asked).toEqual([rest.endsAt])
  })
})
