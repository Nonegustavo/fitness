import { describe, expect, it } from 'vitest'
import { screenAction, type ScreenContext } from './screenActions'

const context: ScreenContext = { today: '2026-11-06', meal: 'lunch' }
const on = (pathname: string, search = '') => screenAction(pathname, search, context)

describe('the "+" of each screen', () => {
  it('opens the sheet to log anything on Hoje', () => {
    expect(on('/')).toEqual({ kind: 'sheet', label: 'Registrar' })
  })

  it('adds a food in the meal of the hour, on the day shown', () => {
    expect(on('/alimentacao')).toMatchObject({ kind: 'go', to: '/alimentacao/adicionar?refeicao=lunch', replace: false })
    expect(on('/alimentacao', '?data=2026-11-04')).toMatchObject({ to: '/alimentacao/adicionar?refeicao=lunch&data=2026-11-04' })
  })

  it("adds on Corpo what the tab is about, keeping the tab", () => {
    expect(on('/corpo')).toMatchObject({ kind: 'go', to: '/corpo?novo=peso', replace: true, label: 'Nova pesagem' })
    expect(on('/corpo', '?aba=peso')).toMatchObject({ to: '/corpo?aba=peso&novo=peso' })
    expect(on('/corpo', '?aba=medidas')).toMatchObject({ to: '/corpo?aba=medidas&novo=medida', label: 'Nova medição' })
    expect(on('/corpo', '?aba=fotos')).toMatchObject({ to: '/corpo?aba=fotos&novo=foto', label: 'Nova foto' })
  })

  it('opens the forms of the other screens, on the day they show', () => {
    expect(on('/diario', '?data=2026-11-02')).toMatchObject({ to: '/diario?data=2026-11-02&dor=nova', replace: true })
    expect(on('/habitos')).toMatchObject({ to: '/habitos?novo=habito', replace: true })
    expect(on('/treinos/exercicios')).toMatchObject({ to: '/treinos/exercicios?novo=exercicio' })
    expect(on('/treinos/atividades')).toMatchObject({ to: '/treinos/atividades?novo=fit' })
    expect(on('/corrida/tenis')).toMatchObject({ to: '/corrida/tenis?novo=tenis' })
    expect(on('/agua')).toEqual({ kind: 'water', label: 'Registrar água' })
    expect(on('/treinos')).toMatchObject({ kind: 'workout' })
  })

  it('adds water on the past day shown, else today', () => {
    expect(on('/agua', '?data=2026-11-04')).toEqual({ kind: 'water', label: 'Registrar água', date: '2026-11-04' })
    expect(on('/agua', '?data=2026-11-06')).toEqual({ kind: 'water', label: 'Registrar água' })
    expect(on('/agua', '?data=2026-11-09')).toEqual({ kind: 'water', label: 'Registrar água' })
    expect(on('/agua', '?data=ontem')).toEqual({ kind: 'water', label: 'Registrar água' })
  })

  it('schedules on the chosen day of the calendar, or today when that one is past', () => {
    expect(on('/calendario')).toMatchObject({ kind: 'plan', date: '2026-11-06' })
    expect(on('/calendario', '?dia=2026-11-20')).toMatchObject({ kind: 'plan', date: '2026-11-20' })
    expect(on('/calendario', '?dia=2026-10-01')).toMatchObject({ kind: 'plan', date: '2026-11-06' })
    expect(on('/calendario', '?dia=amanhã')).toMatchObject({ kind: 'plan', date: '2026-11-06' })
  })

  it('leaves where there is nothing to add, or where it would be in the way', () => {
    for (const path of ['/sono', '/analise', '/correlacoes', '/ajustes', '/mais', '/passos', '/calorias', '/corrida', '/corrida/recordes', '/semana', '/retrospectiva', '/clima', '/treinos/atividades/abc', '/treinos/exercicios/xyz', '/nao-existe']) {
      expect(on(path), path).toBeUndefined()
    }
    for (const path of ['/alimentacao/adicionar', '/treinos/sessao/1', '/treinos/ficha/nova', '/treinos/ficha/2']) {
      expect(on(path), path).toBeUndefined()
    }
  })
})
