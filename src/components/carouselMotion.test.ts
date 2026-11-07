import { describe, expect, it } from 'vitest'
import { dragFrames, enterFrame, leaveFrame, SHIFT, swipeDirection, swipeEnd } from './carouselMotion'

const WIDTH = 360

describe('swipeEnd', () => {
  it('switches after a long enough drag, toward the side the finger went', () => {
    expect(swipeEnd(-WIDTH * 0.4, 0, WIDTH)).toBe(1)
    expect(swipeEnd(WIDTH * 0.4, 0, WIDTH)).toBe(-1)
  })

  it('goes back after a short, slow drag', () => {
    expect(swipeEnd(-40, 0.05, WIDTH)).toBe(0)
    expect(swipeEnd(0, 0, WIDTH)).toBe(0)
  })

  it('switches on a quick flick even when short, but not on a tiny one', () => {
    expect(swipeEnd(-30, -0.6, WIDTH)).toBe(1)
    expect(swipeEnd(30, 0.6, WIDTH)).toBe(-1)
    expect(swipeEnd(-10, -0.6, WIDTH)).toBe(0)
  })

  it('cancels when the finger flicks back toward where it started', () => {
    expect(swipeEnd(-WIDTH * 0.5, 0.6, WIDTH)).toBe(0)
  })
})

describe('dragFrames', () => {
  it('moves the card with the finger and fades it while the next one comes in', () => {
    expect(swipeDirection(-10)).toBe(1)
    const start = dragFrames(-1, WIDTH, true)
    expect(start.current.x).toBe(-1)
    expect(start.current.opacity).toBeCloseTo(1, 1)
    expect(start.neighbor!.x).toBeCloseTo(WIDTH * SHIFT, 0)
    expect(start.neighbor!.opacity).toBe(0)

    const half = dragFrames(-WIDTH / 2, WIDTH, true)
    expect(half.current).toEqual({ x: -WIDTH / 2, opacity: expect.closeTo(0.3, 5) })
    expect(half.neighbor!.x).toBeCloseTo((WIDTH * SHIFT) / 2)
    expect(half.neighbor!.opacity).toBeCloseTo(0.55)

    const all = dragFrames(-WIDTH * 2, WIDTH, true)
    expect(all.current.opacity).toBe(0)
    expect(all.neighbor).toEqual({ x: 0, opacity: 1 })
  })

  it('brings the previous card in from the left', () => {
    expect(dragFrames(WIDTH / 2, WIDTH, true).neighbor!.x).toBeCloseTo(-(WIDTH * SHIFT) / 2)
  })

  it('only gives a little, and stays visible, with no card on that side', () => {
    expect(dragFrames(-100, WIDTH, false)).toEqual({ current: { x: -25, opacity: 1 } })
  })
})

describe('switch frames', () => {
  it('brings the new card in from the side of its place in the order', () => {
    expect(enterFrame(1, WIDTH)).toEqual({ x: WIDTH * SHIFT, opacity: 0 })
    expect(enterFrame(-1, WIDTH)).toEqual({ x: -WIDTH * SHIFT, opacity: 0 })
  })

  it('sends the old card out the other side, or on past where a swipe left it', () => {
    expect(leaveFrame({ x: 0, opacity: 1 }, 1, WIDTH)).toEqual({ x: -WIDTH * SHIFT, opacity: 0 })
    expect(leaveFrame({ x: 0, opacity: 1 }, -1, WIDTH)).toEqual({ x: WIDTH * SHIFT, opacity: 0 })
    expect(leaveFrame({ x: -200, opacity: 0.3 }, 1, WIDTH)).toEqual({ x: -(200 + (WIDTH * SHIFT) / 2), opacity: 0 })
  })
})
