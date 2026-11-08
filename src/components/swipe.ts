/** The decisions of a sideways drag between pages (days, tabs), kept apart from the DOM to be tested. */

/** How far a finger moves before the drag counts as sideways or as a scroll. */
export const SLOP_PX = 12
/** Sideways only when the horizontal travel beats the vertical by this much; a diagonal scrolls. */
const SIDEWAYS = 1.2
/** A release faster than this (px/ms, about 350 px/s) is a flick: it goes by its direction alone. */
export const FLICK = 0.35
/** A slow release changes the page past this share of its width. */
export const COMMIT_SHARE = 0.35
/** A flick shorter than this is a tap that slipped, not a swipe. */
const MIN_FLICK_PX = 16

export type Side = -1 | 1

/** 'x' for a swipe, 'y' for a scroll, undefined while the finger is still within the slop. */
export function lockOf(dx: number, dy: number): 'x' | 'y' | undefined {
  if (Math.hypot(dx, dy) < SLOP_PX) return undefined
  return Math.abs(dx) > Math.abs(dy) * SIDEWAYS ? 'x' : 'y'
}

/** Past the last page the content follows less and less, like pulling something elastic. */
export function rubberBand(distance: number, size: number): number {
  const pulled = Math.abs(distance)
  return Math.sign(distance) * (1 - 1 / ((pulled * 0.55) / size + 1)) * size
}

/**
 * Where a released drag goes: 1 to the next page (the content was pulled left), -1 to the previous
 * one, 0 back to where it was. A flick goes by its direction (back, if it was thrown the other way);
 * a slow release by how far it got.
 */
export function releaseTarget(offset: number, velocity: number, width: number, can: Record<Side, boolean>): Side | 0 {
  const toward: Side | 0 = offset < 0 ? 1 : offset > 0 ? -1 : 0
  if (toward === 0 || !can[toward]) return 0
  if (Math.abs(velocity) >= FLICK && Math.abs(offset) >= MIN_FLICK_PX) return Math.sign(velocity) === Math.sign(offset) ? toward : 0
  return Math.abs(offset) >= width * COMMIT_SHARE ? toward : 0
}

/** A page a pager draws: the one shown (side 0), or one off to a side. */
export interface PageSlot<K> {
  key: K
  side: Side | 0
  /** Kept ready, out of sight, for a drag to come: drawn ahead, it doesn't hold the finger back then. */
  ready?: boolean
}

/**
 * The pages to draw: the one shown, the other one on screen (the neighbor a drag pulls in, or the
 * page a slide takes away), and the neighbors kept ready that are still next to the one shown. In
 * their order, so a page taking another role (ready, pulled in, shown) stays where it is in the DOM.
 */
export function pageSlots<K>(
  shown: K,
  other: { key: K; side: Side } | undefined,
  ready: readonly K[],
  neighbor: (key: K, side: Side) => K | undefined,
  compare: (a: K, b: K) => number,
): PageSlot<K>[] {
  const slots: PageSlot<K>[] = [{ key: shown, side: 0 }]
  if (other && other.key !== shown) slots.push({ key: other.key, side: other.side })
  for (const side of [-1, 1] as const) {
    const key = neighbor(shown, side)
    if (key !== undefined && ready.includes(key) && !slots.some((slot) => slot.key === key)) slots.push({ key, side, ready: true })
  }
  return slots.sort((a, b) => compare(a.key, b.key))
}

export interface Sample {
  t: number
  x: number
}

/** Only the last moments of a drag say how fast it was let go. */
const VELOCITY_WINDOW_MS = 100

/** The finger's speed at release (px/ms) from its last positions; 0 when it had stopped. */
export function velocityOf(samples: Sample[], now: number): number {
  const recent = samples.filter((sample) => now - sample.t <= VELOCITY_WINDOW_MS)
  if (recent.length < 2) return 0
  const first = recent[0]
  const last = recent[recent.length - 1]
  return last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0
}

/**
 * How long the slide after a release takes: quicker for a fast flick, so the page leaves at about
 * the finger's speed, and never so quick it jumps nor so slow it drags.
 */
export function settleMs(distance: number, velocity: number): number {
  const fromSpeed = Math.abs(velocity) > 0.05 ? (2.2 * Math.abs(distance)) / Math.abs(velocity) : Infinity
  const fromDistance = 180 + 0.25 * Math.abs(distance)
  return Math.round(Math.min(320, Math.max(160, Math.min(fromSpeed, fromDistance))))
}
