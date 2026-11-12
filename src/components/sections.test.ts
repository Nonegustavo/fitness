import { describe, expect, it } from 'vitest'
import { bottomSections, currentEntry, DEFAULT_BOTTOM, SCREENS, SECTIONS, toneForPath } from './sections'

const MENU = [...SECTIONS, ...SCREENS].map((entry) => entry.to)

describe('currentEntry', () => {
  it('picks the most specific entry a screen falls under', () => {
    expect(currentEntry('/corrida/provas', MENU)).toBe('/corrida/provas')
    expect(currentEntry('/corrida/recordes', MENU)).toBe('/corrida')
    expect(currentEntry('/treinos/sessao/abc', MENU)).toBe('/treinos')
  })

  it('keeps Hoje for the first screen only', () => {
    expect(currentEntry('/', MENU)).toBe('/')
    expect(currentEntry('/mais', MENU)).toBeUndefined()
  })
})

describe('toneForPath', () => {
  it("gives a screen its section's color, or its own", () => {
    expect(toneForPath('/')).toBe('today')
    expect(toneForPath('/alimentacao/adicionar')).toBe('food')
    expect(toneForPath('/treinos/atividades/1')).toBe('training')
    expect(toneForPath('/semana')).toBe('insights')
    expect(toneForPath('/mais')).toBeUndefined()
  })
})

describe('bottomSections', () => {
  it('falls back to the default unless four known sections were chosen', () => {
    const paths = (chosen?: string[]) => bottomSections(chosen).map((section) => section.to)
    expect(paths(undefined)).toEqual(DEFAULT_BOTTOM)
    expect(paths(['/', '/sono', '/agua', '/diario'])).toEqual(['/', '/sono', '/agua', '/diario'])
    expect(paths(['/', '/sono', '/sono', '/nada'])).toEqual(DEFAULT_BOTTOM)
  })

  it('never offers a screen that is not a section', () => {
    expect(paths(['/', '/passos', '/agua', '/diario'])).toEqual(DEFAULT_BOTTOM)
    function paths(chosen: string[]) {
      return bottomSections(chosen).map((section) => section.to)
    }
  })
})
