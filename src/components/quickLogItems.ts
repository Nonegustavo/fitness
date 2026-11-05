/** What the "+" can offer (Settings.quickLog holds the chosen ones), in the order its editor lists them. */
export const QUICK_LOG_ITEMS = ['food', 'plate', 'weight', 'measure', 'workout', 'walk', 'habits', 'journal', 'pain', 'water'] as const

export type QuickLogId = (typeof QUICK_LOG_ITEMS)[number]

/** Until the user picks: food, the weigh-in, the workout and the diary, with the water below. */
export const DEFAULT_QUICK_LOG: QuickLogId[] = ['food', 'weight', 'workout', 'journal', 'water']

const KNOWN = new Set<string>(QUICK_LOG_ITEMS)
const isQuickLogId = (id: string): id is QuickLogId => KNOWN.has(id)

/** What the "+" shows, in order: the saved items it knows, once each, or the default when nothing was saved. */
export function quickLogItems(saved: string[] | undefined): QuickLogId[] {
  return saved ? [...new Set(saved.filter(isQuickLogId))] : DEFAULT_QUICK_LOG
}

/** The items not shown, in the catalog's order, to add back. */
export const missingItems = (shown: QuickLogId[]): QuickLogId[] => QUICK_LOG_ITEMS.filter((id) => !shown.includes(id))

/** Puts an item in (at the end) or takes it out. */
export function toggleQuickLog(shown: QuickLogId[], id: QuickLogId, on: boolean): QuickLogId[] {
  const without = shown.filter((other) => other !== id)
  return on ? [...without, id] : without
}

export type QuickLogBlock = { kind: 'tiles'; ids: Exclude<QuickLogId, 'water'>[] } | { kind: 'water' }

/** The sheet top to bottom: runs of tiles, and the water buttons where they fall in the order. */
export function quickLogBlocks(items: QuickLogId[]): QuickLogBlock[] {
  const blocks: QuickLogBlock[] = []
  for (const id of items) {
    const last = blocks.at(-1)
    if (id === 'water') blocks.push({ kind: 'water' })
    else if (last?.kind === 'tiles') last.ids.push(id)
    else blocks.push({ kind: 'tiles', ids: [id] })
  }
  return blocks
}
