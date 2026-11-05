import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../db/schema'
import type { Settings, WeightEntry } from '../../db/types'
import { shiftDay } from '../../lib/dates'
import { checkInLines } from './contextCheckIn'

const meta = { updatedAt: 0, deleted: 0 as const, dirty: 0 as const }
// Thursday; the week's check-in is from Sunday the 1st, reading October 4 to 31.
const today = '2026-11-05'
const sunday = '2026-11-01'

const days = Array.from({ length: 28 }, (_, i) => shiftDay(sunday, -1 - i))
const foodLogs = days.map((date) => ({ date, nutrients: { kcal: 2300, protein: 150, carbs: 268, fat: 70 } }))
// Steady at 80 kg: spending what was eaten, 2300.
const weights: WeightEntry[] = days.map((date) => ({ ...meta, id: date, date, time: Date.parse(`${date}T07:00:00`), weightKg: 80, source: 'manual' }))
const sources = { foodLogs, weights, sessions: [] }

const settings = (changes: Partial<Settings> = {}): Settings => ({
  ...meta,
  id: 'settings',
  ...DEFAULT_SETTINGS,
  nutrition: { normal: { kcal: 2300, protein: 150, carbs: 268, fat: 70 } },
  weightGoal: { targetKg: 75, kgPerWeek: -0.25 },
  ...changes,
})

describe('checkInLines', () => {
  it('says nothing without a weight goal or targets', () => {
    expect(checkInLines(sources, settings({ weightGoal: undefined }), today)).toEqual([])
    expect(checkInLines(sources, settings({ nutrition: undefined }), today)).toEqual([])
  })

  it('tells the proposal still waiting for an answer, and why', () => {
    expect(checkInLines(sources, settings(), today)).toEqual([
      '- Check-in semanal das metas (semana de 1/11 a 7/11): o app propõe 2.050 kcal (proteína 150 g, carboidratos 223 g, gorduras 62 g) no lugar de 2.300 kcal (proteína 150 g, carboidratos 268 g, gorduras 70 g) (gasto estimado 2.300 kcal por dia; para perder 0,25 kg por semana, a média seria 2.025 kcal; limitado a 250 kcal de mudança por semana). A pessoa ainda não respondeu.',
    ])
  })

  it('tells what the person did with it', () => {
    const dismissed = checkInLines(sources, settings({ goalCheckIn: { week: sunday, status: 'dismissed' } }), today)
    expect(dismissed[0]).toMatch(/A pessoa deixou para depois: as metas atuais seguem valendo\.$/)
    const accepted = checkInLines(
      sources,
      settings({
        nutrition: { normal: { kcal: 2050, protein: 150, carbs: 223, fat: 62 } },
        goalCheckIn: {
          week: sunday,
          status: 'accepted',
          before: { kcal: 2300, protein: 150, carbs: 268, fat: 70 },
          proposed: { kcal: 2050, protein: 150, carbs: 223, fat: 62 },
          expenditure: 2300,
        },
      }),
      today,
    )
    expect(accepted).toEqual([
      '- Check-in semanal das metas (semana de 1/11 a 7/11): a pessoa aceitou as metas que o app propôs, 2.050 kcal (proteína 150 g, carboidratos 223 g, gorduras 62 g); antes eram 2.300 kcal (proteína 150 g, carboidratos 268 g, gorduras 70 g), com gasto estimado de 2.300 kcal por dia.',
    ])
  })

  it('tells what is missing', () => {
    expect(checkInLines({ ...sources, weights: weights.slice(0, 5) }, settings(), today)).toEqual([
      '- Check-in semanal das metas (semana de 1/11 a 7/11): sem proposta, faltam dados (5 de 12 pesagens).',
    ])
  })
})
