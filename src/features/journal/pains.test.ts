import { describe, expect, it } from 'vitest'
import type { Pain } from '../../db/types'
import { addition, intensity, painLines, painsOn, painsText, painSuggestions, removal, scoreDay, scoreOn, withScore } from './pains'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const pain = (changes: Partial<Pain> = {}): Pain => ({
  id: 'shin',
  name: 'canela direita',
  start: '2026-10-28',
  scores: { '2026-10-28': 6 },
  ...meta,
  ...changes,
})

describe('scores', () => {
  const shin = pain({ scores: { '2026-10-28': 6, '2026-10-31': 5, '2026-11-03': 4 } })

  it('carries the last score to the days after it, until a new one', () => {
    expect(scoreOn(shin, '2026-10-28')).toBe(6)
    expect(scoreOn(shin, '2026-10-30')).toBe(6)
    expect(scoreOn(shin, '2026-11-01')).toBe(5)
    expect(scoreOn(shin, '2026-11-05')).toBe(4)
    expect(scoreDay(shin, '2026-11-02')).toBe('2026-10-31')
    expect(scoreOn(shin, '2026-10-27')).toBeUndefined()
  })

  it('changes only the day it is set on, within 1 to 10', () => {
    const changed = withScore(shin, '2026-10-29', 12)
    expect(changed.scores['2026-10-29']).toBe(10)
    expect(scoreOn(changed, '2026-10-30')).toBe(10)
    expect(scoreOn(changed, '2026-11-01')).toBe(5)
  })

  it('names how bad it is', () => {
    expect([1, 4, 7, 9].map(intensity)).toEqual(['leve', 'moderada', 'forte', 'muito forte'])
  })
})

describe('painsOn', () => {
  it('lists the pains going on that day, from the start to the end', () => {
    const back = pain({ id: 'back', name: 'lombar', start: '2026-11-01', end: '2026-11-03', scores: { '2026-11-01': 3 } })
    const list = [back, pain()]
    expect(painsOn(list, '2026-11-02').map((p) => p.id)).toEqual(['shin', 'back'])
    expect(painsOn(list, '2026-11-04').map((p) => p.id)).toEqual(['shin'])
    expect(painsOn(list, '2026-10-27')).toEqual([])
  })
})

describe('addition', () => {
  it('starts a new pain on the day, in the words typed', () => {
    expect(addition([], '  joelho   esquerdo ', 3, '2026-11-04')).toEqual({
      name: 'joelho esquerdo',
      start: '2026-11-04',
      scores: { '2026-11-04': 3 },
    })
  })

  it('gives the score to a pain of the same name going on, ignoring case and accents', () => {
    expect(addition([pain()], 'Canéla direita', 3, '2026-11-04')).toEqual({
      id: 'shin',
      name: 'canela direita',
      start: '2026-10-28',
      scores: { '2026-10-28': 6, '2026-11-04': 3 },
    })
  })

  it('moves the start back when the same pain begins later, and starts over after one that ended', () => {
    expect(addition([pain()], 'canela direita', 2, '2026-10-25')).toMatchObject({ id: 'shin', start: '2026-10-25' })
    const ended = pain({ end: '2026-10-30' })
    expect(addition([ended], 'canela direita', 2, '2026-11-04')).not.toHaveProperty('id')
  })
})

describe('removal', () => {
  const shin = pain({ scores: { '2026-10-28': 6, '2026-11-02': 4, '2026-11-04': 3 } })

  it('deletes a pain removed on the day it started', () => {
    expect(removal(shin, '2026-10-28')).toEqual({ kind: 'delete' })
  })

  it('ends it the day before on a later day, keeping the history up to then', () => {
    expect(removal(shin, '2026-11-03')).toEqual({
      kind: 'end',
      pain: { ...shin, end: '2026-11-02', scores: { '2026-10-28': 6, '2026-11-02': 4 } },
    })
  })
})

describe('painSuggestions', () => {
  const pains = [
    pain({ id: 'a', name: 'lombar', start: '2026-09-01', end: '2026-09-10' }),
    pain({ id: 'b', name: 'joelho esquerdo', start: '2026-10-01', end: '2026-10-20' }),
    pain({ id: 'c', name: 'canela direita' }),
    pain({ id: 'd', name: 'Lombar', start: '2026-08-01', end: '2026-08-03' }),
  ]

  it('offers the names told before, the latest first, without the ones going on that day', () => {
    expect(painSuggestions(pains, '2026-11-04', '')).toEqual(['joelho esquerdo', 'lombar'])
    expect(painSuggestions(pains, '2026-10-01', '')).toEqual(['canela direita', 'lombar'])
  })

  it('narrows them by what is typed, and leaves out the exact name', () => {
    expect(painSuggestions(pains, '2026-11-04', 'jo')).toEqual(['joelho esquerdo'])
    expect(painSuggestions(pains, '2026-11-04', 'LOMBAR')).toEqual([])
  })
})

describe('for the analysis', () => {
  const shin = pain({ scores: { '2026-10-28': 6, '2026-10-29': 6, '2026-10-31': 5, '2026-11-03': 4 } })
  const knee = pain({ id: 'knee', name: 'joelho', start: '2026-10-10', end: '2026-10-20', scores: { '2026-10-10': 3, '2026-10-15': 5 } })
  const old = pain({ id: 'old', name: 'ombro', start: '2026-08-01', end: '2026-08-05', scores: { '2026-08-01': 2 } })

  it('writes the pains of a day with their scores', () => {
    expect(painsText([shin, knee], '2026-11-01')).toBe('canela direita 5/10')
    expect(painsText([knee], '2026-11-01')).toBeUndefined()
  })

  it('lists the pains going on and the ones that ended lately, with each change of score', () => {
    expect(painLines([knee, old, shin], '2026-11-04')).toEqual([
      '- canela direita: desde 28/10 (8 dias), hoje 4/10; notas: 6 em 28/10, 5 em 31/10, 4 em 3/11',
      '- joelho: de 10/10 a 20/10 (11 dias), já passou; notas: 3 em 10/10, 5 em 15/10',
    ])
  })
})
