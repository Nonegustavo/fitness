/** Where an arrow key (or Home, End) takes the choice among `count` options side by side, going around at the ends. */
export function arrowTarget(key: string, index: number, count: number): number | undefined {
  if (count <= 0) return undefined
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return undefined
}

/** What Tab can reach inside a sheet. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Where Tab (or Shift+Tab) should go so the focus stays inside a sheet: its first control after the
 * last (and the other way around), or undefined when the browser's own next stop is already inside.
 * `focused` is what has the focus now; `stops` are the sheet's controls in order.
 */
export function wrappedStop<T>(stops: T[], focused: T | null, backwards: boolean): T | undefined {
  if (stops.length === 0) return undefined
  const at = focused === null ? -1 : stops.indexOf(focused)
  if (backwards) return at <= 0 ? stops[stops.length - 1] : undefined
  return at === -1 || at === stops.length - 1 ? stops[0] : undefined
}

/** A sheet's controls that Tab stops at, the hidden ones left out. */
export const tabStops = (container: HTMLElement): HTMLElement[] =>
  [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0)
