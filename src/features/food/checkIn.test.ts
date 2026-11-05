import { describe, expect, it } from 'vitest'
import type { GoalCheckIn, MacroGoals, Settings, WeightEntry } from '../../db/types'
import { shiftDay, type DayKey } from '../../lib/dates'
import type { DayValue } from '../../lib/stats'
import {
  checkInFrom,
  missingLines,
  missingShort,
  numberRows,
  pendingGoals,
  pendingProposal,
  reasonLines,
  weeklyCheckIn,
  type CheckIn,
  type CheckInInput,
  type Proposal,
} from './checkIn'

// A Sunday: the check-in reads the 4 weeks up to the Saturday before.
const sunday = '2026-11-08'
const normal: MacroGoals = { kcal: 2300, protein: 150, carbs: 268, fat: 70 }

/** 4 weeks of the same intake every day and a weight trend going `kgPerWeek`, ending at `endKg` yesterday. */
function history({ intake = 2300, kgPerWeek = -0.3, endKg = 79.8, asOf = sunday, days = 28, weighIns = 28 } = {}) {
  const eaten = new Map<DayKey, number>()
  const trend: DayValue[] = []
  for (let back = days; back >= 1; back--) {
    const date = shiftDay(asOf, -back)
    eaten.set(date, intake)
    if (back <= weighIns) trend.push({ date, value: endKg - ((back - 1) * kgPerWeek) / 7 })
  }
  return { intake: eaten, weightTrend: trend }
}

type SettingsPart = CheckInInput['settings']
const settingsWith = (changes: Partial<SettingsPart> = {}): SettingsPart => ({
  nutrition: { normal },
  weightGoal: { targetKg: 72, kgPerWeek: -0.5 },
  ...changes,
})

const ready = (checkIn: CheckIn): Proposal => {
  if (checkIn.kind !== 'ready') throw new Error(`not ready: ${JSON.stringify(checkIn)}`)
  return checkIn.proposal
}

const run = (settings: SettingsPart, data = history(), trainingDays = new Set<DayKey>(), asOf = sunday) =>
  weeklyCheckIn({ asOf, settings, trainingDays, ...data })

describe('weeklyCheckIn', () => {
  it('proposes the calories of the goal pace on top of the estimated spending', () => {
    // Eating 2300 while losing 0,3 kg a week: spending 2630; −0,5 kg a week needs 550 less.
    const p = ready(run(settingsWith()))
    expect(p.expenditure.kcal).toBeCloseTo(2630)
    expect(p.aimKcal).toBeCloseTo(2080)
    expect(p.deltaKcal).toBe(-220)
    expect(p.limitedBy).toBeUndefined()
    // Protein stays, fat keeps its share of the calories, carbs take the rest.
    expect(p.proposed.normal).toEqual({ kcal: 2080, protein: 150, carbs: 228, fat: 63 })
    expect(p.changed).toBe(true)
    expect(p.phase).toBe('pace')
  })

  it('moves at most 250 kcal in a check-in', () => {
    const p = ready(run(settingsWith({ weightGoal: { targetKg: 70, kgPerWeek: -1 } })))
    expect(p.aimKcal).toBeCloseTo(1530)
    expect(p.proposed.normal.kcal).toBe(2050)
    expect(p.deltaKcal).toBe(-250)
    expect(p.limitedBy).toBe('step')
    expect(reasonLines(p)).toContain('Para não mudar demais de uma vez, a mudança desta semana fica em −250 kcal (no máximo 250 por semana).')
  })

  it('never goes under 1500 kcal', () => {
    // Spending 1700; −0,5 kg a week would be 1150 (1350 after the step), but 1500 is the least.
    const p = ready(
      run(
        settingsWith({
          nutrition: { normal: { kcal: 1600, protein: 130, carbs: 160, fat: 50 } },
          weightGoal: { targetKg: 60, kgPerWeek: -0.5 },
        }),
        history({ intake: 1700, kgPerWeek: 0, endKg: 70 }),
      ),
    )
    expect(p.proposed.normal.kcal).toBe(1500)
    expect(p.limitedBy).toBe('floor')
    expect(reasonLines(p).at(-1)).toBe('O app não propõe menos de 1.500 kcal por dia.')

    // A target set under the floor comes back up to it, even when that is a small change.
    const under = ready(
      run(
        settingsWith({
          nutrition: { normal: { kcal: 1480, protein: 130, carbs: 150, fat: 50 } },
          weightGoal: { targetKg: 60, kgPerWeek: -0.5 },
        }),
        history({ intake: 1700, kgPerWeek: 0, endKg: 70 }),
      ),
    )
    expect(under.proposed.normal.kcal).toBe(1500)
    expect(under.deltaKcal).toBe(20)
  })

  it('raises protein to 1,6 g and fat to 0,6 g per kg of trend weight', () => {
    // 100 kg: at least 160 g of protein and 60 g of fat; carbs give way.
    const low: MacroGoals = { kcal: 2300, protein: 120, carbs: 350, fat: 50 }
    const p = ready(run(settingsWith({ nutrition: { normal: low } }), history({ endKg: 100 })))
    expect(p.proteinMin).toBe(160)
    expect(p.fatMin).toBe(60)
    expect(p.proposed.normal).toMatchObject({ kcal: 2080, protein: 160, fat: 60 })
    expect(p.proposed.normal.carbs).toBe(Math.round((2080 - 160 * 4 - 60 * 9) / 4))
    expect(p.proteinRaised && p.fatRaised).toBe(true)
  })

  it('keeps the targets when the change would be small', () => {
    // Spending 2300 at a steady weight, to keep it: nothing to change.
    const p = ready(run(settingsWith({ weightGoal: { targetKg: 80, kgPerWeek: 0 } }), history({ kgPerWeek: 0, endKg: 80 })))
    expect(p.deltaKcal).toBe(0)
    expect(p.changed).toBe(false)
    expect(p.proposed.normal).toBe(normal)
    expect(reasonLines(p)).toEqual([
      'Seu gasto estimado é 2.300 kcal por dia.',
      'Para manter o peso, a média seria 2.300 kcal por dia.',
      'Isso fica perto da sua meta: as calorias não mudam.',
    ])
  })

  it('holds the weight once the target is reached, and slows down right before it', () => {
    const reached = ready(run(settingsWith({ weightGoal: { targetKg: 80, kgPerWeek: -0.5 } })))
    expect(reached.phase).toBe('reached')
    expect(reached.kgPerWeek).toBe(0)
    expect(reached.aimKcal).toBeCloseTo(2630)
    expect(reached.deltaKcal).toBe(250)

    // 0,2 kg left at −0,5 kg a week: only those 0,2 kg this week.
    const closing = ready(run(settingsWith({ weightGoal: { targetKg: 79.6, kgPerWeek: -0.5 } })))
    expect(closing.phase).toBe('closing')
    expect(closing.kgPerWeek).toBeCloseTo(-0.2)
    expect(closing.proposed.normal.kcal).toBe(2410)
  })

  it('moves the training-day targets by the same amount, the other days making the week average the pace', () => {
    const training: MacroGoals = { kcal: 2600, protein: 150, carbs: 343, fat: 70 }
    // Gaining 0,25 kg a week at 2300: spending 2025. The goal −0,25 kg a week asks 1750 on average.
    const days = new Set(Array.from({ length: 8 }, (_, i) => shiftDay(sunday, -2 - 3 * i)))
    const p = ready(
      run(
        settingsWith({ nutrition: { normal, training }, weightGoal: { targetKg: 70, kgPerWeek: -0.25 } }),
        history({ kgPerWeek: 0.25 }),
        days,
      ),
    )
    // 8 training days in 28 (2 a week) with 300 kcal more: 1750 − 300 × 8/28 ≈ 1664 on the other days, limited to −250.
    expect(p.training?.daysPerWeek).toBeCloseTo(2)
    expect(p.training?.normalKcal).toBeCloseTo(1750 - 300 * (8 / 28))
    expect(p.proposed.normal.kcal).toBe(2050)
    expect(p.proposed.training?.kcal).toBe(2350)
    expect(reasonLines(p)[2]).toBe('Com cerca de 2 dias de treino por semana, que têm 300 kcal a mais, os outros dias ficariam em 1.664 kcal.')
  })

  it('takes one step a week: a second look after accepting starts from where the week began', () => {
    const accepted: GoalCheckIn = { week: sunday, status: 'accepted', before: normal, proposed: { ...normal, kcal: 2050 } }
    const p = ready(
      run({
        nutrition: { normal: { kcal: 2050, protein: 150, carbs: 213, fat: 62 } },
        weightGoal: { targetKg: 70, kgPerWeek: -1 },
        goalCheckIn: accepted,
      }),
    )
    expect(p.deltaKcal).toBe(0)
    expect(p.changed).toBe(false)
    expect(reasonLines(p)).toContain('As calorias já mudaram o máximo desta semana (250 kcal).')
  })

  it('says what is missing instead of proposing', () => {
    const none = run({}, { intake: new Map(), weightTrend: [] })
    expect(none).toMatchObject({ kind: 'missing', week: sunday })
    expect(none.kind === 'missing' && missingLines(none.missing)).toEqual([
      'Defina uma meta de peso, em Corpo.',
      'Defina as metas de calorias e macros, em Metas.',
      'Registre a alimentação em mais 18 dias: são 0 de 18 nas últimas 4 semanas.',
      'Pese-se em mais 12 dias: são 0 pesagens de 12 nas últimas 4 semanas.',
    ])

    // 12 days logged and 8 weigh-ins: a rough guess, not enough to change the targets on.
    const few = run(settingsWith(), history({ days: 12, weighIns: 8 }))
    expect(few.kind === 'missing' && few.missing).toEqual([
      { what: 'logs', have: 12, need: 18 },
      { what: 'weighIns', have: 8, need: 12 },
    ])
    expect(few.kind === 'missing' && missingShort(few.missing)).toBe('alimentação registrada em 12 de 18 dias; 8 de 12 pesagens')
  })

  it('leaves out days that look forgotten', () => {
    const data = history()
    for (const date of [...data.intake.keys()].slice(0, 11)) data.intake.set(date, 600)
    const checkIn = run(settingsWith(), data)
    expect(checkIn.kind === 'missing' && checkIn.missing).toEqual([{ what: 'logs', have: 17, need: 18 }])
  })

  it('reads the 4 weeks before the day it is made for, in the week of its Sunday', () => {
    const midweek = run(settingsWith(), history({ asOf: '2026-11-11' }), new Set(), '2026-11-11')
    expect(midweek).toMatchObject({ kind: 'ready', week: sunday, asOf: '2026-11-11' })
    expect(numberRows(midweek as Extract<CheckIn, { kind: 'ready' }>)[0]).toEqual({ label: 'Período', value: '14/10 a 10/11 (4 semanas)' })
  })
})

describe('pendingProposal', () => {
  const checkIn = run(settingsWith())

  it('waits for an answer to this week', () => {
    expect(pendingProposal(checkIn, undefined)).toBeDefined()
    expect(pendingGoals(pendingProposal(checkIn, undefined))).toEqual({ kcal: 2080, delta: -220 })
    expect(pendingProposal(checkIn, { week: '2026-11-01', status: 'accepted' })).toBeDefined()
    expect(pendingProposal(checkIn, { week: sunday, status: 'dismissed' })).toBeUndefined()
    expect(pendingProposal(checkIn, { week: sunday, status: 'accepted' })).toBeUndefined()
  })

  it('has nothing to ask when nothing changes or data is missing', () => {
    expect(pendingProposal(run(settingsWith({ weightGoal: { targetKg: 80, kgPerWeek: 0 } }), history({ kgPerWeek: 0 })), undefined)).toBeUndefined()
    expect(pendingProposal(run({}), undefined)).toBeUndefined()
  })
})

describe('checkInFrom', () => {
  it('builds the intake, the weight trend and the training days from the rows', () => {
    const meta = { updatedAt: 0, deleted: 0 as const, dirty: 0 as const }
    const foodLogs = Array.from({ length: 28 }, (_, i) => shiftDay(sunday, -1 - i)).flatMap((date) => [
      { date, nutrients: { kcal: 1300, protein: 70, carbs: 140, fat: 40 } },
      { date, nutrients: { kcal: 1000, protein: 50, carbs: 100, fat: 30 } },
    ])
    const weights: WeightEntry[] = Array.from({ length: 20 }, (_, i) => {
      const date = shiftDay(sunday, -1 - i)
      return { ...meta, id: date, date, time: Date.parse(`${date}T07:00:00`), weightKg: 80, source: 'manual' }
    })
    const settings: Pick<Settings, 'nutrition' | 'weightGoal'> = settingsWith({ weightGoal: { targetKg: 80, kgPerWeek: 0 } })
    const checkIn = checkInFrom({ foodLogs, weights, sessions: [] }, settings, sunday)
    const p = ready(checkIn)
    expect(p.expenditure.intake).toBe(2300)
    expect(p.expenditure.kcal).toBeCloseTo(2300)
    expect(p.changed).toBe(false)
  })
})
