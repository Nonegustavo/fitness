import { describe, expect, it } from 'vitest'
import { DEFAULT_QUICK_LOG, missingItems, quickLogBlocks, quickLogItems, toggleQuickLog } from './quickLogItems'

describe('the items of the "+"', () => {
  it('are the usual ones until the user picks, then the picked ones in their order', () => {
    expect(quickLogItems(undefined)).toEqual(['food', 'weight', 'workout', 'journal', 'water'])
    expect(quickLogItems(['walk', 'plate', 'water'])).toEqual(['walk', 'plate', 'water'])
    // Unknown or repeated ids (from a newer app, say) are dropped; an empty list stays empty.
    expect(quickLogItems(['pain', 'gone', 'pain', 'habits'])).toEqual(['pain', 'habits'])
    expect(quickLogItems([])).toEqual([])
  })

  it('go in at the end or out, and the editor offers the rest in its own order', () => {
    expect(toggleQuickLog(DEFAULT_QUICK_LOG, 'measure', true)).toEqual(['food', 'weight', 'workout', 'journal', 'water', 'measure'])
    expect(toggleQuickLog(DEFAULT_QUICK_LOG, 'workout', false)).toEqual(['food', 'weight', 'journal', 'water'])
    expect(missingItems(DEFAULT_QUICK_LOG)).toEqual(['plate', 'measure', 'walk', 'habits', 'pain'])
  })

  it('show as tiles, with the water buttons where they fall in the order', () => {
    expect(quickLogBlocks(DEFAULT_QUICK_LOG)).toEqual([{ kind: 'tiles', ids: ['food', 'weight', 'workout', 'journal'] }, { kind: 'water' }])
    expect(quickLogBlocks(['food', 'water', 'weight', 'walk'])).toEqual([
      { kind: 'tiles', ids: ['food'] },
      { kind: 'water' },
      { kind: 'tiles', ids: ['weight', 'walk'] },
    ])
    expect(quickLogBlocks([])).toEqual([])
  })
})
