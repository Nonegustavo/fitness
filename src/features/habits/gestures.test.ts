import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_PRESS_MS, longPressHandlers } from './gestures'

const pointer = (pointerType = 'touch', clientX = 10, clientY = 10) => ({ button: 0, pointerType, clientX, clientY })
const event = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn() })

describe('longPressHandlers', () => {
  let open: ReturnType<typeof vi.fn<() => void>>
  let buzz: ReturnType<typeof vi.fn<() => void>>
  let press: ReturnType<typeof longPressHandlers>
  beforeEach(() => {
    vi.useFakeTimers()
    open = vi.fn<() => void>()
    buzz = vi.fn<() => void>()
    press = longPressHandlers(open, buzz)
  })
  afterEach(() => vi.useRealTimers())

  it('lets a quick tap through to the click', () => {
    press.onPointerDown(pointer())
    vi.advanceTimersByTime(200)
    press.onPointerUp()
    const end = event()
    press.onTouchEnd(end)
    const click = event()
    press.onClickCapture(click)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(end.preventDefault).not.toHaveBeenCalled()
    expect(click.stopPropagation).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it("opens at once on the phone's long press, and swallows a click after it", () => {
    press.onPointerDown(pointer())
    vi.advanceTimersByTime(400)
    const menu = event()
    press.onContextMenu(menu)
    expect(menu.preventDefault).toHaveBeenCalled()
    expect(open).toHaveBeenCalledTimes(1)
    expect(buzz).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    press.onPointerUp()
    press.onTouchEnd(event())
    const click = event()
    press.onClickCapture(click)
    expect(click.stopPropagation).toHaveBeenCalled()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('opens a finger held past the delay on release, cancelling the click of the touch', () => {
    press.onPointerDown(pointer())
    vi.advanceTimersByTime(LONG_PRESS_MS + 100)
    expect(open).not.toHaveBeenCalled()
    expect(buzz).toHaveBeenCalledTimes(1)
    press.onPointerUp()
    press.onPointerLeave(pointer())
    const end = event()
    press.onTouchEnd(end)
    expect(end.preventDefault).toHaveBeenCalled()
    expect(open).toHaveBeenCalledTimes(1)
    expect(buzz).toHaveBeenCalledTimes(1)
  })

  it('opens a mouse held down without waiting, and a right click', () => {
    press.onPointerDown(pointer('mouse'))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(open).toHaveBeenCalledTimes(1)
    press.onPointerUp()
    const click = event()
    press.onClickCapture(click)
    expect(click.stopPropagation).toHaveBeenCalled()
    press.onPointerDown({ ...pointer('mouse'), button: 2 })
    press.onContextMenu(event())
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('lets a scroll go: a finger that moves, or a press the browser takes over, opens nothing', () => {
    press.onPointerDown(pointer())
    press.onPointerMove(pointer('touch', 10, 30))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    press.onPointerDown(pointer())
    press.onPointerCancel()
    vi.advanceTimersByTime(LONG_PRESS_MS)
    const end = event()
    press.onTouchEnd(end)
    expect(end.preventDefault).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('lets the next tap through after a long press', () => {
    press.onPointerDown(pointer())
    press.onContextMenu(event())
    press.onPointerDown(pointer())
    press.onPointerUp()
    const click = event()
    press.onClickCapture(click)
    expect(click.stopPropagation).not.toHaveBeenCalled()
  })
})
