import { describe, expect, it } from 'vitest'
import type { Activity, DailyHealth, Exercise, FoodLog, Settings, WeightEntry, WorkoutSession } from '../../db/types'
import { dayRange, shiftDay } from '../../lib/dates'
import type { AgendaItem } from '../calendar/agenda'
import {
  activityText,
  adherenceLines,
  bodyLines,
  dayWorkouts,
  energyLines,
  freshnessLines,
  gymText,
  mealsText,
  recoveryParts,
  sleepParts,
  strengthLines,
  walkingLines,
  weekLines,
} from './contextParts'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const TODAY = '2026-11-05'
const at = (date: string, hour: number, minute = 0) => new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`).getTime()

const run = (changes: Partial<Activity> = {}): Activity => ({
  id: 'run',
  sport: 'running',
  title: 'Corrida Intervalado',
  date: TODAY,
  startTime: at(TODAY, 6, 30),
  elapsedSec: 2700,
  timerSec: 2580,
  distanceM: 8000,
  avgSpeed: 1000 / 322.5,
  avgHr: 152,
  maxHr: 176,
  avgCadence: 170,
  ascentM: 40,
  aerobicEffect: 3.4,
  anaerobicEffect: 2.1,
  hrZones: { seconds: [120, 900, 900, 540, 120], limits: [] },
  laps: [],
  hasTrack: true,
  ...meta,
  ...changes,
})

const bench: Exercise = { id: 'bench', name: 'Supino reto', muscle: 'chest', equipment: 'barbell', type: 'weight_reps', ...meta }
const squat: Exercise = { id: 'squat', name: 'Agachamento', muscle: 'quads', equipment: 'barbell', type: 'weight_reps', ...meta }
const exercises = new Map([bench, squat].map((exercise) => [exercise.id, exercise]))

const session = (date: string, kg: number, changes: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: `s-${date}`,
  name: 'PUSH DAY',
  date,
  startedAt: at(date, 18),
  endedAt: at(date, 19, 5),
  exercises: [
    {
      key: 'a',
      exerciseId: 'bench',
      restSec: 90,
      sets: [
        { key: '1', kind: 'warmup', weightKg: 40, reps: 10, done: true },
        { key: '2', kind: 'normal', weightKg: kg, reps: 8, done: true },
        { key: '3', kind: 'normal', weightKg: kg - 5, reps: 10, done: true },
      ],
    },
  ],
  ...meta,
  ...changes,
})

describe('a day', () => {
  it('describes the night: stages, times, heart rate, breathing and the nap', () => {
    const health: DailyHealth = {
      id: TODAY,
      sleep: {
        totalSec: 7.5 * 3600,
        score: 81,
        deepSec: 5400,
        remSec: 5400,
        lightSec: 14400,
        awakeSec: 1500,
        start: at('2026-11-04', 23, 10),
        end: at(TODAY, 7, 5),
        avgHr: 51.6,
        avgRespiration: 14.2,
        napSec: 1800,
      },
      ...meta,
    }
    expect(sleepParts(health)).toEqual([
      'sono 7h30 (nota 81, profundo 1h30, REM 1h30, leve 4h00, acordado 25 min, deitou 23:10, levantou 07:05, FC 52 bpm, respiração 14/min)',
      'cochilo 30 min',
    ])
  })

  it('puts the HRV next to its normal range and status, and the watch calories', () => {
    const health: DailyHealth = {
      id: TODAY,
      hrv: { lastNight: 47, weeklyAvg: 52, status: 'LOW', balancedLow: 48, balancedHigh: 60 },
      restingHr: 50,
      bodyBattery: { low: 25, high: 90 },
      stress: { avg: 29, max: 88 },
      steps: 10700,
      calories: { total: 2850, active: 820 },
      ...meta,
    }
    expect(recoveryParts(health)).toEqual([
      'HRV 47 ms (média de 7 dias 52, faixa normal 48–60, baixa)',
      'FC repouso 50 bpm',
      'Body Battery mín. 25, máx. 90',
      'estresse 29 (máx. 88)',
      'passos 10.700',
      'gasto pelo relógio 2.850 kcal (ativas 820)',
    ])
  })

  it('details a run: pace, heart rate, zones, the coach plan, the laps and the comment', () => {
    const text = activityText(
      run({
        effort: 7,
        notes: 'Tiros no ritmo.',
        workout: {
          steps: [
            { index: 1, intensity: 'WARMUP', durationType: 'TIME', durationValue: 600 },
            { index: 2, intensity: 'INTERVAL', durationType: 'DISTANCE', durationValue: 400 },
          ],
        },
        laps: [
          { startTime: 0, elapsedSec: 600, timerSec: 600, distanceM: 1800, avgSpeed: 3, avgHr: 140 },
          { startTime: 0, elapsedSec: 100, timerSec: 100, distanceM: 400, avgSpeed: 4, avgHr: 170 },
        ],
      }),
    )
    expect(text).toMatch(/^Corrida Intervalado: 8 km em 43 min, ritmo 5:23\/km, FC 152 \(máx\. 176\), cadência 170, subida 40 m/)
    expect(text).toContain('efeito aeróbico 3,4, anaeróbico 2,1')
    expect(text).toContain('zonas de FC Z1 5%, Z2 35%, Z3 35%, Z4 21%, Z5 5%')
    expect(text).toContain('esforço 7/10, comentário: "Tiros no ritmo."')
    expect(text).toContain('planejado: ')
    expect(text).toContain('voltas: 1) 1,8 km a 5:33/km FC 140; 2) 0,4 km a 4:10/km FC 170')
  })

  it('lists the gym workout exercise by exercise, with the watch time and heart rate and the comment', () => {
    const watch = run({ id: 'gym', sport: 'training', subSport: 'strengthTraining', title: 'Musculação', startTime: at(TODAY, 18), timerSec: 3900, distanceM: undefined, avgHr: 112, calories: 320 })
    const text = gymText(session(TODAY, 80, { effort: 8, notes: 'Ombro ok.' }), exercises, watch)
    expect(text).toBe(
      'musculação «PUSH DAY» (1h05, FC média 112, 320 kcal): Supino reto 2 séries (melhor 80 kg × 8) — 2 séries, 1.390 kg levantados, esforço 8/10, comentário: "Ombro ok."',
    )
  })

  it('counts the watch strength activity as the app workout it recorded, not as a second workout', () => {
    const watch = run({ id: 'gym', sport: 'training', subSport: 'strengthTraining', title: 'Musculação', startTime: at(TODAY, 18, 2), timerSec: 3700, distanceM: undefined })
    const list = dayWorkouts(TODAY, [run(), watch], [session(TODAY, 80)], exercises)
    expect(list).toHaveLength(2)
    expect(list[0]).toMatch(/^Corrida Intervalado:/)
    expect(list[1]).toMatch(/^musculação «PUSH DAY» \(1h02/)
  })

  it('writes each meal with its time, calories, protein and what was in it', () => {
    const log = (meal: FoodLog['meal'], hour: number, name: string, grams: number, kcal: number, protein: number, extra: Partial<FoodLog> = {}): FoodLog => ({
      id: `${meal}-${name}`,
      date: TODAY,
      meal,
      time: at(TODAY, hour),
      foodId: 'x',
      name,
      grams,
      nutrients: { kcal, protein, carbs: 0, fat: 0 },
      ...meta,
      ...extra,
    })
    const text = mealsText([
      log('lunch', 12, 'Arroz branco', 150, 190, 4),
      log('breakfast', 7, 'Ovos mexidos', 100, 150, 13),
      log('breakfast', 7, 'Pão de forma', 50, 130, 5, { portion: { label: 'fatia', grams: 25 } }),
      log('lunch', 12, 'Whey', 1, 120, 24, { unit: 'portion' }),
    ])
    expect(text).toBe(
      'café da manhã 07:00 (280 kcal, P 18 g): Ovos mexidos 100 g, Pão de forma 2× fatia (50 g) · almoço 12:00 (310 kcal, P 28 g): Arroz branco 150 g, Whey 1 porção',
    )
  })
})

describe('the sections', () => {
  const days = dayRange(shiftDay(TODAY, -69), TODAY)

  it('writes one line per week, with the current one so far', () => {
    const lines = weekLines(
      { activities: [run()], sessions: [session(TODAY, 80)], foodLogs: [], health: [], weights: [], habits: [], habitLogs: [] },
      TODAY,
      2,
    )
    expect(lines).toHaveLength(3)
    expect(lines[2]).toMatch(/^- 1\/11–7\/11 \(esta semana, até hoje\): musculação 1; corrida 1 \(8 km, 5:23\/km\); tempo de treino/)
  })

  it('keeps the walks apart from the running: count, km and time per week, and the weekly walk', () => {
    const walk = (date: string, km: number, minutes: number) =>
      run({ id: `w-${date}`, sport: 'walking', title: 'Caminhada', date, distanceM: km * 1000, timerSec: minutes * 60 })
    const lines = walkingLines(
      [walk('2026-10-13', 3, 40), walk('2026-11-02', 2.5, 30), walk('2026-11-04', 3.1, 41), run()],
      { days: [1, 3, 5], time: '07:00', targetMin: 40 },
      TODAY,
    )
    expect(lines).toEqual([
      '- Caminhadas por semana (4 semanas, da mais antiga; fora da corrida): 0 · 1 (3 km, 40 min) · 0 · 0; esta semana até agora 2 (5,6 km, 1h11)',
      '- Caminhada semanal programada no app: seg, qua e sex às 07:00, 40 min',
    ])
    expect(walkingLines([run()], undefined, TODAY)).toEqual([])
  })

  it('tracks the lifts: estimated 1RM against the 4 weeks before, sets per muscle', () => {
    const sessions = [session('2026-09-20', 70), session('2026-10-05', 75), session('2026-11-02', 80)]
    const lines = strengthLines(sessions, exercises, TODAY)
    expect(lines[1]).toBe('  - Supino reto: 1RM 101 kg (antes 95 kg, +7%); segunda 2/11 80 kg × 8')
    expect(lines[2]).toBe('- Séries por grupo muscular nesta semana (na passada): Peito 2 (0)')
  })

  it('gives the weight trend, its pace against the goal and the composition', () => {
    const weights: WeightEntry[] = days.map((date, i) => ({
      id: `w${i}`,
      date,
      time: at(date, 7),
      weightKg: 85 - i * 0.05,
      ...(i === days.length - 1 ? { bodyFatPct: 18.5, muscleMassKg: 62 } : {}),
      source: 'health-connect',
      ...meta,
    }))
    const lines = bodyLines({ weights, measurements: [], sites: [], settings: { weightGoal: { targetKg: 78, kgPerWeek: -0.4 } } }, TODAY)
    expect(lines[0]).toMatch(/^- Peso \(tendência, sem o sobe e desce diário\): [\d,]+ kg; há 4 semanas [\d,]+ kg; ritmo −0,3\d kg por semana$/)
    expect(lines[1]).toMatch(/^- Meta: 78 kg a −0,40 kg por semana; no ritmo atual, chega lá por volta de /)
    expect(lines[2]).toContain('gordura 18,5 %, massa muscular 62 kg')
  })

  it('compares what the body spends with what was eaten, and protein per kg', () => {
    const weights: WeightEntry[] = days.map((date, i) => ({ id: `w${i}`, date, time: at(date, 7), weightKg: 85 - i * 0.05, source: 'manual', ...meta }))
    const foodLogs: FoodLog[] = days.map((date) => ({
      id: `f-${date}`, date, meal: 'lunch', time: at(date, 12), foodId: 'x', name: 'Dia', grams: 1, nutrients: { kcal: 2200, protein: 150, carbs: 0, fat: 0 }, ...meta,
    }))
    const lines = energyLines({ foodLogs, weights, health: [] }, TODAY)
    expect(lines[0]).toMatch(/^- Gasto estimado pelo app .*: 2\.\d{3} kcal por dia; consumo médio 2\.200 kcal; saldo −\d{3} kcal por dia$/)
    expect(lines[1]).toMatch(/^- Proteína: 150 g por dia nos 14 dias registrados das últimas 2 semanas \(1,8 g por kg de peso\)$/)
  })

  it('counts planned against done and brings back the last tips', () => {
    const item = (date: string, status: AgendaItem['status'], title: string): AgendaItem => ({
      key: title,
      date,
      kind: 'run',
      title,
      status,
      event: { date, title },
    })
    const settings = { id: 'settings', waterGoalMl: 3000, measurementSites: [], ...meta } as Settings
    const lines = adherenceLines(
      {
        agenda: [item('2026-11-02', 'done', 'Corrida 7 Km'), item('2026-11-03', 'missed', 'Educativos'), item('2026-11-06', 'planned', 'Longão')],
        habits: [],
        habitLogs: [],
        water: [],
        foodLogs: [],
        sessions: [],
        settings,
        insights: [
          { id: '2026-11-04', headline: 'x', sections: [{ area: 'sono', title: 't', text: 'x', tips: ['Dormir antes das 23h'] }], createdAt: 1, model: 'x', ...meta },
        ],
      },
      TODAY,
    )
    expect(lines[0]).toBe('- Treinos planejados nas últimas 2 semanas: 1 de 2 feitos; não feitos: terça 3/11 Educativos')
    expect(lines).toContain('- Dicas da análise de quarta 4/11: "Dormir antes das 23h"')
  })

  it('says when each source last synced and what today has so far', () => {
    const lines = freshnessLines(
      { garmin: at(TODAY, 7, 10), healthConnect: at('2026-11-04', 22, 30) },
      { date: TODAY, weighed: false, lastMeal: at(TODAY, 12, 40), slept: true, workouts: 0 },
    )
    expect(lines).toEqual([
      '- Garmin (atividades, sono, HRV, passos): última busca hoje às 07:10',
      '- Health Connect no celular (balança e fases do sono): última leitura ontem às 22:30',
      '- Hoje até agora: o sono da noite já chegou, sem pesagem, comida registrada até 12:40, nenhum treino registrado',
    ])
  })
})
