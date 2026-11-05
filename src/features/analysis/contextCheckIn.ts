import type { MacroGoals, Settings } from '../../db/types'
import { formatDay, shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { checkInFrom, decisionFor, missingShort, paceText, type CheckInSources } from '../food/checkIn'

const kcal = (value: number) => `${formatNumber(value, 0)} kcal`
const goalsText = (goals: MacroGoals) =>
  `${kcal(goals.kcal)} (proteína ${formatNumber(goals.protein, 0)} g, carboidratos ${formatNumber(goals.carbs, 0)} g, gorduras ${formatNumber(goals.fat, 0)} g)`

/**
 * This week's check-in of the nutrition targets, for the daily analysis: what the app proposed from
 * the spending and the weight goal, and what the person did with it. Nothing without a weight goal
 * and targets.
 */
export function checkInLines(sources: CheckInSources, settings: Settings, today: DayKey): string[] {
  if (!settings.weightGoal || !settings.nutrition) return []
  const checkIn = checkInFrom(sources, settings, weekStart(today))
  const head = `- Check-in semanal das metas (semana de ${formatDay(checkIn.week, 'd/MM')} a ${formatDay(shiftDay(checkIn.week, 6), 'd/MM')})`
  const decision = decisionFor(checkIn, settings.goalCheckIn)
  if (decision?.status === 'accepted' && decision.proposed) {
    const before = decision.before ? `; antes eram ${goalsText(decision.before)}` : ''
    const spent = decision.expenditure ? `, com gasto estimado de ${kcal(decision.expenditure)} por dia` : ''
    return [`${head}: a pessoa aceitou as metas que o app propôs, ${goalsText(decision.proposed)}${before}${spent}.`]
  }
  if (checkIn.kind === 'missing') return [`${head}: sem proposta, faltam dados (${missingShort(checkIn.missing)}).`]

  const p = checkIn.proposal
  const basis = `gasto estimado ${kcal(p.expenditure.kcal)} por dia; para ${paceText(p.kgPerWeek)}, a média seria ${kcal(p.aimKcal)}`
  if (!p.changed) return [`${head}: metas mantidas (${basis}).`]
  const limit =
    p.limitedBy === 'step' ? '; limitado a 250 kcal de mudança por semana' : p.limitedBy === 'floor' ? '; no mínimo 1.500 kcal' : ''
  const answer =
    decision?.status === 'dismissed'
      ? 'A pessoa deixou para depois: as metas atuais seguem valendo.'
      : 'A pessoa ainda não respondeu.'
  return [`${head}: o app propõe ${goalsText(p.proposed.normal)} no lugar de ${goalsText(p.current.normal)} (${basis}${limit}). ${answer}`]
}
