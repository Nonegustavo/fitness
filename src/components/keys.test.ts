import { describe, expect, it } from 'vitest'
import { arrowTarget, wrappedStop } from './keys'

describe('arrowTarget', () => {
  it('moves to the neighbour and goes around at the ends', () => {
    expect(arrowTarget('ArrowRight', 0, 3)).toBe(1)
    expect(arrowTarget('ArrowRight', 2, 3)).toBe(0)
    expect(arrowTarget('ArrowLeft', 0, 3)).toBe(2)
    expect(arrowTarget('ArrowDown', 1, 3)).toBe(2)
    expect(arrowTarget('ArrowUp', 1, 3)).toBe(0)
  })

  it('jumps to the ends and ignores other keys', () => {
    expect(arrowTarget('Home', 2, 3)).toBe(0)
    expect(arrowTarget('End', 0, 3)).toBe(2)
    expect(arrowTarget('Enter', 0, 3)).toBeUndefined()
    expect(arrowTarget('ArrowRight', 0, 0)).toBeUndefined()
  })
})

describe('wrappedStop', () => {
  const stops = ['fechar', 'campo', 'salvar']

  it('goes around at the ends of the sheet', () => {
    expect(wrappedStop(stops, 'salvar', false)).toBe('fechar')
    expect(wrappedStop(stops, 'fechar', true)).toBe('salvar')
  })

  it("leaves the browser's own step alone in the middle", () => {
    expect(wrappedStop(stops, 'campo', false)).toBeUndefined()
    expect(wrappedStop(stops, 'campo', true)).toBeUndefined()
    expect(wrappedStop(stops, 'fechar', false)).toBeUndefined()
  })

  it('brings the focus in when it is outside (on the sheet itself, or the page behind)', () => {
    expect(wrappedStop(stops, null, false)).toBe('fechar')
    expect(wrappedStop(stops, 'outro', false)).toBe('fechar')
    expect(wrappedStop(stops, 'outro', true)).toBe('salvar')
    expect(wrappedStop([], null, false)).toBeUndefined()
  })
})
