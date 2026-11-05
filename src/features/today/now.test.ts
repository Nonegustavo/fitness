import { describe, expect, it } from 'vitest'
import type { WorkoutPlan } from '../../db/types'
import { inTime, nextStep, type NowDay } from './now'

const today = '2026-11-04'
const at = (hour: number, minute = 0, day = 4) => new Date(2026, 10, day, hour, minute)

const base: NowDay = {
  today,
  agenda: [],
  weighed: true,
  weighsIn: true,
  meals: new Set(['breakfast', 'lunch', 'dinner']),
  usualMeals: new Set(['breakfast', 'lunch', 'dinner']),
  waterMl: 3000,
  waterGoalMl: 3000,
  glassMl: 250,
  habitsLeft: [],
  journaled: true,
}

const run = (hour: number | undefined, date = today) => ({
  date,
  kind: 'run' as const,
  title: 'Corrida 7 km',
  status: 'planned' as const,
  time: hour === undefined ? undefined : at(hour, 0, Number(date.slice(8))).getTime(),
})
const gym = (hour?: number) => ({
  date: today,
  kind: 'gym' as const,
  title: 'Treino A',
  status: 'planned' as const,
  time: hour === undefined ? undefined : at(hour).getTime(),
  plan: { templateId: 'tpl-a' } as WorkoutPlan,
})

describe('nextStep', () => {
  it('brings back the workout in progress before anything else', () => {
    const step = nextStep({ ...base, active: { id: 's1', name: 'Treino B' }, weighed: false, agenda: [run(7)] }, at(7))
    expect(step).toMatchObject({ kind: 'workout', title: 'Treino B em andamento', action: { type: 'link', to: '/treinos/sessao/s1' } })
  })

  it('shows a workout from 1h30 before its time to 1h after, ahead of the weigh-in', () => {
    const day = { ...base, weighed: false, agenda: [run(7)] }
    expect(nextStep(day, at(5, 40))).toMatchObject({
      kind: 'workout',
      when: 'Agora',
      title: 'Corrida 7 km às 07:00',
      detail: 'Começa em 1 h 20',
    })
    expect(nextStep(day, at(6, 50))?.detail).toBe('Começa em 10 min')
    expect(nextStep(day, at(7, 50))?.detail).toBe('Era para as 07:00')
    expect(nextStep(day, at(8, 10))?.kind).toBe('weighIn')
  })

  it('starts the gym workout with its scheduled template, or else the rotation', () => {
    expect(nextStep({ ...base, agenda: [gym(18)] }, at(17))?.action).toEqual({ type: 'start', templateId: 'tpl-a', label: 'Iniciar' })
    const garminGym = { ...gym(18), plan: undefined }
    expect(nextStep({ ...base, agenda: [garminGym], gymTemplateId: 'tpl-next' }, at(17))?.action).toMatchObject({
      type: 'start',
      templateId: 'tpl-next',
    })
    expect(nextStep({ ...base, agenda: [run(18)] }, at(17))?.action).toEqual({
      type: 'link',
      to: `/calendario?dia=${today}`,
      label: 'Detalhes',
    })
  })

  it('asks for the weigh-in in the morning only when weighing in is a habit', () => {
    expect(nextStep({ ...base, weighed: false }, at(7))?.kind).toBe('weighIn')
    expect(nextStep({ ...base, weighed: false }, at(11, 30))).toBeUndefined()
    expect(nextStep({ ...base, weighed: false, smart: { weighIn: '10:00' } }, at(11, 30))?.kind).toBe('weighIn')
    expect(nextStep({ ...base, weighed: false, weighsIn: false }, at(7))).toBeUndefined()
  })

  it('asks for a usual meal while it is being eaten, at the smart reminder time when set', () => {
    const noLunch = { ...base, meals: new Set(['breakfast'] as const) }
    expect(nextStep(noLunch, at(13))).toMatchObject({
      kind: 'meal',
      title: 'Registrar o almoço',
      action: { to: `/alimentacao/adicionar?refeicao=lunch&data=${today}` },
    })
    expect(nextStep(noLunch, at(12))?.kind).not.toBe('meal')
    expect(nextStep({ ...noLunch, smart: { lunch: '11:30' } }, at(12))?.kind).toBe('meal')
    expect(nextStep({ ...noLunch, usualMeals: new Set(['dinner'] as const) }, at(13))).toBeUndefined()
  })

  it('nudges the water only when well behind the pace of the day', () => {
    // At 15h the pace of a 3 L day is 1.6 L.
    expect(nextStep({ ...base, waterMl: 1000 }, at(15))).toMatchObject({
      kind: 'water',
      action: { type: 'water', ml: 250, label: '250 ml' },
    })
    expect(nextStep({ ...base, waterMl: 1200 }, at(15))).toBeUndefined()
    expect(nextStep({ ...base, waterMl: 0 }, at(8))).toBeUndefined()
  })

  it('mentions a workout later today when nothing else is pending', () => {
    expect(nextStep({ ...base, agenda: [run(19)] }, at(10))).toMatchObject({
      when: 'Mais tarde',
      title: 'Corrida 7 km às 19:00',
      detail: 'Começa em 9 h',
    })
    expect(nextStep({ ...base, agenda: [gym()] }, at(10))).toMatchObject({ title: 'Treino A', detail: 'Sem horário marcado' })
  })

  it('closes the day with the habits still open, then the journal', () => {
    const evening = { ...base, habitsLeft: ['Creatina', 'Alongamento'], journaled: false }
    expect(nextStep(evening, at(18))).toBeUndefined()
    expect(nextStep(evening, at(19, 30))).toMatchObject({ kind: 'habits', title: 'Faltam 2 hábitos', detail: 'Creatina, Alongamento' })
    expect(nextStep({ ...evening, habitsLeft: ['Creatina'] }, at(20))?.title).toBe('Falta 1 hábito: Creatina')
    expect(nextStep({ ...evening, habitsLeft: [] }, at(21, 30))).toMatchObject({ kind: 'journal', action: { to: '/diario' } })
  })

  it('with everything done, points at the next workout of the coming days', () => {
    const tomorrow = run(7, '2026-11-05')
    expect(nextStep({ ...base, agenda: [tomorrow] }, at(14))).toMatchObject({
      kind: 'upcoming',
      when: 'Próximo treino',
      title: 'Amanhã: Corrida 7 km às 07:00',
      detail: 'Tudo em dia por agora',
    })
    expect(nextStep({ ...base, agenda: [run(undefined, '2026-11-07')] }, at(14))?.title).toBe('Sábado: Corrida 7 km')
    expect(nextStep(base, at(14))).toBeUndefined()
  })

  it('leaves out what is done, missed or a rest day', () => {
    const agenda = [
      { ...run(7), status: 'done' as const },
      { ...run(8), kind: 'rest' as const },
    ]
    expect(nextStep({ ...base, agenda }, at(7, 30))).toBeUndefined()
  })
})

describe('inTime', () => {
  it('reads minutes and hours', () => {
    expect(inTime(40 * 60_000)).toBe('em 40 min')
    expect(inTime(80 * 60_000)).toBe('em 1 h 20')
    expect(inTime(182 * 60_000)).toBe('em 3 h')
    expect(inTime(0)).toBe('em 1 min')
  })
})
