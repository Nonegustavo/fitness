import { describe, expect, it } from 'vitest'
import { FLICK, lockOf, pageSlots, releaseTarget, rubberBand, settleMs, SLOP_PX, velocityOf } from './swipe'

const BOTH = { [-1]: true, [1]: true } as const
const WIDTH = 358

describe('a drag between pages', () => {
  it('waits for the slop, then is sideways only when mostly sideways', () => {
    expect(lockOf(SLOP_PX - 1, 0)).toBeUndefined()
    expect(lockOf(5, 5)).toBeUndefined()
    expect(lockOf(-20, 4)).toBe('x')
    expect(lockOf(20, -15)).toBe('x')
    // A diagonal, or anything more down than across, is the page scrolling.
    expect(lockOf(14, 14)).toBe('y')
    expect(lockOf(3, -30)).toBe('y')
  })

  it('pulls past the last page less and less, never as far as the finger', () => {
    const near = rubberBand(-50, WIDTH)
    const far = rubberBand(-300, WIDTH)
    expect(near).toBeLessThan(0)
    expect(Math.abs(near)).toBeLessThan(50)
    expect(Math.abs(far)).toBeLessThan(150)
    expect(Math.abs(far) - Math.abs(near)).toBeLessThan(250)
    expect(rubberBand(80, WIDTH)).toBeCloseTo(-rubberBand(-80, WIDTH))
    expect(rubberBand(0, WIDTH)).toBe(0)
  })
})

describe('letting go', () => {
  it('turns the page past a third of the width, slowly, and springs back short of it', () => {
    expect(releaseTarget(-140, 0, WIDTH, BOTH)).toBe(1)
    expect(releaseTarget(140, 0.1, WIDTH, BOTH)).toBe(-1)
    expect(releaseTarget(-100, -0.1, WIDTH, BOTH)).toBe(0)
  })

  it('goes with a flick whatever the distance, and back when thrown the other way', () => {
    expect(releaseTarget(-40, -FLICK, WIDTH, BOTH)).toBe(1)
    expect(releaseTarget(30, 0.8, WIDTH, BOTH)).toBe(-1)
    // Dragged far left but flicked back right: stays.
    expect(releaseTarget(-200, 0.6, WIDTH, BOTH)).toBe(0)
    // A slip of the finger isn't a flick.
    expect(releaseTarget(-8, -1, WIDTH, BOTH)).toBe(0)
  })

  it('never goes where there is no page (past today, the last tab)', () => {
    expect(releaseTarget(-300, -2, WIDTH, { [-1]: true, [1]: false })).toBe(0)
    expect(releaseTarget(300, 2, WIDTH, { [-1]: false, [1]: true })).toBe(0)
    expect(releaseTarget(300, 2, WIDTH, { [-1]: true, [1]: false })).toBe(-1)
    expect(releaseTarget(0, -2, WIDTH, BOTH)).toBe(0)
  })

  it('reads the speed from the last moments only', () => {
    const steady = [0, 16, 32, 48, 64].map((t) => ({ t, x: -t }))
    expect(velocityOf(steady, 64)).toBeCloseTo(-1)
    // Held still for a while before letting go: no flick.
    expect(velocityOf(steady, 400)).toBe(0)
    expect(velocityOf([{ t: 10, x: 5 }], 10)).toBe(0)
  })

  it('slides the rest of the way quicker after a fast flick, within bounds', () => {
    const slow = settleMs(300, 0)
    const fast = settleMs(300, -3)
    expect(fast).toBeLessThan(slow)
    expect(fast).toBeGreaterThanOrEqual(160)
    expect(slow).toBeLessThanOrEqual(320)
    expect(settleMs(5, 0)).toBe(181)
  })
})

describe('the pages a pager draws', () => {
  // Days as numbers in text, up to today ("5").
  const neighbor = (key: string, side: -1 | 1) => (side === 1 && key === '5' ? undefined : String(Number(key) + side))
  const compare = (a: string, b: string) => Number(a) - Number(b)
  const slots = (shown: string, other: { key: string; side: -1 | 1 } | undefined, ready: string[]) =>
    pageSlots(shown, other, ready, neighbor, compare)

  it('is the page shown alone until its neighbors are ready', () => {
    expect(slots('5', undefined, [])).toEqual([{ key: '5', side: 0 }])
  })

  it('keeps the ready neighbors next to the page shown, in their order, and none past the end', () => {
    expect(slots('3', undefined, ['2', '4'])).toEqual([
      { key: '2', side: -1, ready: true },
      { key: '3', side: 0 },
      { key: '4', side: 1, ready: true },
    ])
    expect(slots('5', undefined, ['4', '6'])).toEqual([
      { key: '4', side: -1, ready: true },
      { key: '5', side: 0 },
    ])
  })

  it('draws a neighbor pulled in by a drag once, as the one on screen', () => {
    expect(slots('3', { key: '2', side: -1 }, ['2', '4'])).toEqual([
      { key: '2', side: -1 },
      { key: '3', side: 0 },
      { key: '4', side: 1, ready: true },
    ])
  })

  it('drops the ready pages no longer next to the one shown, but not a page sliding away', () => {
    // From day 1 straight to day 5: day 1 slides out on the left, day 4 is ready on the same side.
    expect(slots('5', { key: '1', side: -1 }, ['0', '2', '4'])).toEqual([
      { key: '1', side: -1 },
      { key: '4', side: -1, ready: true },
      { key: '5', side: 0 },
    ])
  })
})
