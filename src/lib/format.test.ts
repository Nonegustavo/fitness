import { describe, expect, it } from 'vitest'
import { formatClock, formatDuration, formatSigned, parseClock, parseDecimal } from './format'

describe('format', () => {
  it('reads decimals typed with a comma', () => {
    expect(parseDecimal('82,5')).toBe(82.5)
    expect(parseDecimal(' ')).toBeUndefined()
    expect(parseDecimal('8a')).toBeUndefined()
  })

  it('signs changes with a real minus sign', () => {
    expect(formatSigned(-0.44)).toBe('−0,4')
    expect(formatSigned(0.04)).toBe('±0,0')
  })

  it('formats and parses clock times', () => {
    expect(formatClock(90)).toBe('1:30')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(parseClock('1:30')).toBe(90)
    expect(parseClock('45')).toBe(45)
    expect(parseClock('')).toBeUndefined()
    expect(parseClock('1:x')).toBeUndefined()
  })

  it('formats workout durations', () => {
    expect(formatDuration(45 * 60_000)).toBe('45 min')
    expect(formatDuration(65 * 60_000)).toBe('1h05')
  })
})
