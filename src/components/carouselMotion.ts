/** Where a card of the carousel stands: sideways from its place (px) and how visible (0 to 1). */
export interface Frame {
  x: number
  opacity: number
}

export const REST: Frame = { x: 0, opacity: 1 }

/** How far a card travels while switching, as a share of its width: it comes in from that far, and leaves as far. */
export const SHIFT = 0.25

/** A swipe has to go this far (or be flicked) before it switches cards. */
const SWIPE_SHARE = 0.3
/** px per ms: a flick this fast switches even when short. */
const FLICK_SPEED = 0.35
const FLICK_PX = 24
/** How much of the finger's travel the card follows when there's no card on that side. */
const RESISTANCE = 0.25

/** Which way a swipe goes in the order: 1 to the next card (the finger moving left), -1 to the previous. */
export const swipeDirection = (dx: number): 1 | -1 => (dx < 0 ? 1 : -1)

/**
 * Where letting go of a swipe leads: to the next card (1), the previous (-1) or back (0). A long drag
 * switches, and so does a quick flick; a flick back toward the start cancels.
 */
export function swipeEnd(dx: number, velocity: number, width: number): -1 | 0 | 1 {
  if (dx === 0) return 0
  if (Math.abs(velocity) >= FLICK_SPEED) {
    return Math.sign(velocity) === Math.sign(dx) && Math.abs(dx) >= FLICK_PX ? swipeDirection(dx) : 0
  }
  return Math.abs(dx) >= width * SWIPE_SHARE ? swipeDirection(dx) : 0
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

/**
 * A swipe as it goes: the card under the finger follows it and fades, while the one on that side
 * comes in from SHIFT away and shows up, a little behind, so the two aren't seen at half each for
 * long. Without one there, the card only gives a little.
 */
export function dragFrames(dx: number, width: number, hasNeighbor: boolean): { current: Frame; neighbor?: Frame } {
  if (!hasNeighbor || width <= 0) return { current: { x: dx * RESISTANCE, opacity: 1 } }
  const progress = Math.min(1, Math.abs(dx) / width)
  return {
    current: { x: dx, opacity: clamp(1 - progress * 1.4) },
    neighbor: { x: swipeDirection(dx) * width * SHIFT * (1 - progress), opacity: clamp(progress * 1.4 - 0.15) },
  }
}

/** Where a card that leaves ends up: SHIFT away on the other side, or on past where a swipe took it. */
export const leaveFrame = (from: Frame, direction: 1 | -1, width: number): Frame => ({
  x: -direction * Math.max(width * SHIFT, Math.abs(from.x) + (width * SHIFT) / 2),
  opacity: 0,
})

/** Where a card comes in from: SHIFT away on the side of its place in the order. */
export const enterFrame = (direction: 1 | -1, width: number): Frame => ({ x: direction * width * SHIFT, opacity: 0 })
