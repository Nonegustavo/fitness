import { describe, expect, it } from 'vitest'
import { withToast, type ToastOptions } from './Toast'

const undo = (message: string): ToastOptions => ({ message, action: { label: 'Desfazer', onClick: () => {} } })

describe('withToast', () => {
  it('keeps an earlier "Desfazer" when another toast comes', () => {
    const first = undo('Pesagem apagada')
    const shown = withToast([first], { message: 'Atualizado.' })
    expect(shown.map((toast) => toast.message)).toEqual(['Pesagem apagada', 'Atualizado.'])
    expect(shown[0].action).toBe(first.action)
  })

  it('shows the same plain message once', () => {
    const shown = withToast([{ message: 'Atualizado.' }, undo('Registro apagado')], { message: 'Atualizado.' })
    expect(shown.map((toast) => toast.message)).toEqual(['Registro apagado', 'Atualizado.'])
  })

  it('keeps two deletions of things with the same name apart', () => {
    const shown = withToast([undo('Registro de 250 ml apagado')], undo('Registro de 250 ml apagado'))
    expect(shown).toHaveLength(2)
  })

  it('drops the oldest past the limit', () => {
    const shown = ['a', 'b', 'c', 'd'].reduce<ToastOptions[]>((list, message) => withToast(list, undo(message), 3), [])
    expect(shown.map((toast) => toast.message)).toEqual(['b', 'c', 'd'])
  })
})
