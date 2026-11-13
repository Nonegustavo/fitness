import type {
  Activity,
  ActivityStream,
  DailyHealth,
  DailyInsight,
  Food,
  FoodLog,
  FoodPref,
  Gear,
  Habit,
  HabitLog,
  JournalEntry,
  MeasurementEntry,
  Pain,
  Race,
  SavedMeal,
  Settings,
  SleepStageSpan,
  Synced,
  WaterLog,
  WeightEntry,
  WorkoutPlan,
  WorkoutSession,
  WorkoutTemplate,
} from '../src/db/types'

/**
 * A few weeks of made-up data, as a backup file the app imports (Ajustes → Backup → Importar): the
 * screens are then checked with something on them, in the published build, with no test-only door
 * into the database. Deterministic: the same day gives the same file.
 */

const DAY_MS = 86_400_000

const pad = (value: number) => String(value).padStart(2, '0')
const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

type Row<T extends Synced> = Omit<T, 'dirty'>

/** The ids the screens with a parameter in their address need. */
export interface SeedIds {
  template: string
  session: string
  exercise: string
  run: string
  strength: string
}

export interface Seed {
  file: { app: 'fitness'; version: 1; exportedAt: string; tables: Record<string, Row<Synced>[]> }
  ids: SeedIds
  /** How many rows the import should report. */
  rows: number
}

export function buildSeed(now = new Date()): Seed {
  const stamp = now.getTime()
  const meta = { updatedAt: stamp, deleted: 0 as const }
  /** The day `back` days ago, at an hour of it. */
  const at = (back: number, hour = 12, minute = 0) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, hour, minute)
    return { date: keyOf(date), time: date.getTime() }
  }
  // A small generator with a fixed seed: the numbers vary from day to day but not from run to run.
  let state = 7
  const noise = () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
  const between = (low: number, high: number) => low + noise() * (high - low)
  const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits

  const settings: Row<Settings> = {
    id: 'settings',
    ...meta,
    waterGoalMl: 3000,
    measurementSites: [
      { key: 'neck', label: 'Pescoço' },
      { key: 'chest', label: 'Peito' },
      { key: 'arm_r', label: 'Braço direito' },
      { key: 'waist', label: 'Cintura' },
      { key: 'abdomen', label: 'Abdômen' },
      { key: 'hip', label: 'Quadril' },
      { key: 'thigh_r', label: 'Coxa direita' },
    ],
    nutrition: {
      normal: { kcal: 2400, protein: 160, carbs: 280, fat: 70 },
      training: { kcal: 2700, protein: 165, carbs: 340, fat: 72 },
    },
    weightGoal: { targetKg: 78, kgPerWeek: -0.3, startKg: 82 },
    profile: 'Pessoa de teste: 34 anos, musculação 4x por semana e corrida com treinador.',
    heightCm: 178,
    sex: 'male',
    weatherPlace: { name: 'Porto Alegre, RS', lat: -30.03, lon: -51.23 },
    insightsAuto: false,
  }

  const weights: Row<WeightEntry>[] = Array.from({ length: 36 }, (_, back) => {
    const { date, time } = at(back, 7, 10)
    return {
      id: `e2e-peso-${date}`,
      ...meta,
      date,
      time,
      weightKg: round(80.4 + back * 0.045 + between(-0.4, 0.4)),
      bodyFatPct: round(17.2 + back * 0.02 + between(-0.3, 0.3)),
      leanMassKg: round(63 + between(-0.3, 0.3)),
      bodyWaterPct: round(58 + between(-0.5, 0.5)),
      boneMassKg: 3.4,
      bmrKcal: Math.round(1760 + between(-15, 15)),
      source: back % 5 === 0 ? 'manual' : 'health-connect',
    }
  })

  const measurements: Row<MeasurementEntry>[] = [0, 14, 28].map((back) => {
    const { date } = at(back)
    return {
      id: `e2e-medida-${date}`,
      ...meta,
      date,
      values: { neck: 39, chest: 101 + back * 0.02, arm_r: 36.5, waist: 86 + back * 0.05, abdomen: 89 + back * 0.06, hip: 98, thigh_r: 57 },
    }
  })

  const waterLogs: Row<WaterLog>[] = Array.from({ length: 10 }, (_, back) =>
    [8, 11, 14, 17, 20].slice(0, 3 + (back % 3)).map((hour, i): Row<WaterLog> => {
      const { date, time } = at(back, hour, 5)
      return { id: `e2e-agua-${date}-${i}`, ...meta, date, time, ml: i % 2 ? 500 : 250, containerId: i % 2 ? 'default-bottle' : 'default-glass' }
    }),
  ).flat()

  const habitStart = at(40).date
  const habits: Row<Habit>[] = [
    { id: 'e2e-habito-alongar', ...meta, name: 'Alongar', kind: 'check', polarity: 'good', startDate: habitStart, archived: 0, order: 0, time: '07:30', color: 'teal', icon: 'stretch', reminder: { time: '07:30', days: [1, 2, 3, 4, 5] } },
    { id: 'e2e-habito-cafe', ...meta, name: 'Café', kind: 'count', unit: 'xícaras', polarity: 'bad', target: 3, startDate: habitStart, archived: 0, order: 1 },
    { id: 'e2e-habito-leitura', ...meta, name: 'Leitura', kind: 'check', polarity: 'good', startDate: habitStart, archived: 0, order: 2, frequency: { times: 3, per: 'week' } },
  ]
  const habitLogs: Row<HabitLog>[] = Array.from({ length: 30 }, (_, back) => {
    const { date } = at(back)
    const logs: Row<HabitLog>[] = []
    if (back % 4 !== 3) logs.push({ id: `e2e-habito-alongar:${date}`, ...meta, habitId: 'e2e-habito-alongar', date, value: 1 })
    logs.push({ id: `e2e-habito-cafe:${date}`, ...meta, habitId: 'e2e-habito-cafe', date, value: 1 + (back % 4) })
    if (back % 2 === 0) logs.push({ id: `e2e-habito-leitura:${date}`, ...meta, habitId: 'e2e-habito-leitura', date, value: 1 })
    return logs
  }).flat()

  const templateA: Row<WorkoutTemplate> = {
    id: 'e2e-ficha-a',
    ...meta,
    name: 'Peito e costas',
    order: 0,
    exercises: [
      { key: 'a1', exerciseId: 'ex-supino-reto-barra', restSec: 120, sets: [{ kind: 'warmup', reps: 12, weightKg: 30 }, { kind: 'normal', reps: 8, repsMax: 12, weightKg: 60 }, { kind: 'normal', reps: 8, repsMax: 12, weightKg: 60 }, { kind: 'normal', reps: 8, repsMax: 12, weightKg: 60 }] },
      { key: 'a2', exerciseId: 'ex-puxada-frontal', restSec: 90, supersetWithNext: true, sets: [{ kind: 'normal', reps: 10, repsMax: 12, weightKg: 55 }, { kind: 'normal', reps: 10, repsMax: 12, weightKg: 55 }] },
      { key: 'a3', exerciseId: 'ex-flexao', restSec: 90, sets: [{ kind: 'normal', reps: 15 }, { kind: 'normal', reps: 15 }] },
      { key: 'a4', exerciseId: 'ex-prancha', restSec: 60, sets: [{ kind: 'normal', durationSec: 60 }, { kind: 'normal', durationSec: 60 }] },
    ],
  }
  const templateB: Row<WorkoutTemplate> = {
    id: 'e2e-ficha-b',
    ...meta,
    name: 'Pernas',
    order: 1,
    exercises: [
      { key: 'b1', exerciseId: 'ex-agachamento-livre', restSec: 150, sets: [{ kind: 'warmup', reps: 10, weightKg: 40 }, { kind: 'normal', reps: 6, repsMax: 8, weightKg: 90 }, { kind: 'normal', reps: 6, repsMax: 8, weightKg: 90 }] },
      { key: 'b2', exerciseId: 'ex-leg-press', restSec: 120, sets: [{ kind: 'normal', reps: 10, repsMax: 12, weightKg: 180 }, { kind: 'normal', reps: 10, repsMax: 12, weightKg: 180 }] },
      { key: 'b3', exerciseId: 'ex-mesa-flexora', restSec: 90, sets: [{ kind: 'normal', reps: 12, weightKg: 45 }, { kind: 'normal', reps: 12, weightKg: 45 }] },
    ],
  }

  const sessionOf = (template: Row<WorkoutTemplate>, back: number, n: number): Row<WorkoutSession> => {
    const start = at(back, 18, 30)
    let clock = start.time
    return {
      id: `e2e-sessao-${start.date}`,
      ...meta,
      templateId: template.id,
      name: template.name,
      date: start.date,
      startedAt: start.time,
      endedAt: start.time + 62 * 60_000,
      effort: 6 + (n % 3),
      notes: n === 0 ? 'Treino bom, subi a carga do supino.' : undefined,
      exercises: template.exercises.map((exercise) => ({
        key: exercise.key,
        exerciseId: exercise.exerciseId,
        restSec: exercise.restSec,
        supersetWithNext: exercise.supersetWithNext,
        sets: exercise.sets.map(({ kind, ...target }, i) => {
          clock += 3 * 60_000
          return {
            key: `${exercise.key}-${i}`,
            kind,
            target,
            // A little heavier each time, so the progress charts have a slope.
            weightKg: target.weightKg === undefined ? undefined : target.weightKg + Math.max(0, 4 - n) * 2.5,
            reps: target.reps === undefined ? undefined : target.reps + (i % 2),
            durationSec: target.durationSec,
            done: true,
            completedAt: clock,
            rir: kind === 'normal' ? 1 + (i % 2) : undefined,
          }
        }),
      })),
    }
  }
  const sessionDays = [1, 3, 6, 8, 10, 13, 15, 17, 20, 22, 27, 29]
  const workoutSessions = sessionDays.map((back, n) => sessionOf(n % 2 ? templateB : templateA, back, n))

  // Runs with samples every 5 seconds: enough for the records (1, 5 and 10 km) and the charts.
  const runDays = [2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25, 28, 30, 33]
  const activities: Row<Activity>[] = []
  const activityStreams: Row<ActivityStream>[] = []
  runDays.forEach((back, n) => {
    const start = at(back, 6, 40)
    const km = [5.2, 8.1, 10.4, 6.3, 12.2][n % 5]
    const pace = 330 + (n % 4) * 12 // seconds per km
    const seconds = Math.round(km * pace)
    const id = `e2e-corrida-${start.date}`
    const step = 5
    const points = Math.floor(seconds / step)
    const speed = 1000 / pace
    activities.push({
      id,
      ...meta,
      sport: 'running',
      subSport: 'generic',
      title: n % 3 === 0 ? 'Intervalado' : 'Corrida leve',
      date: start.date,
      startTime: start.time,
      elapsedSec: seconds + 40,
      timerSec: seconds,
      distanceM: Math.round(km * 1000),
      calories: Math.round(km * 68),
      avgHr: 148 + (n % 5),
      maxHr: 171 + (n % 4),
      avgSpeed: round(speed, 3),
      maxSpeed: round(speed * 1.4, 3),
      ascentM: 40 + n,
      descentM: 38 + n,
      avgCadence: 168,
      aerobicEffect: 3.1,
      anaerobicEffect: 0.6,
      device: 'Forerunner (teste)',
      laps: Array.from({ length: Math.floor(km) }, (_, lap) => ({
        startTime: start.time + lap * pace * 1000,
        elapsedSec: pace,
        timerSec: pace,
        distanceM: 1000,
        avgHr: 146 + lap,
        maxHr: 158 + lap,
        avgSpeed: round(speed, 3),
        avgCadence: 168,
        intensity: 'active',
      })),
      hrZones: { seconds: [seconds * 0.1, seconds * 0.35, seconds * 0.35, seconds * 0.15, seconds * 0.05].map(Math.round), limits: [115, 134, 153, 172, 191] },
      hasTrack: n % 2 === 0,
      effort: 5 + (n % 4),
      notes: n === 0 ? 'Perna pesada no começo, depois soltou.' : undefined,
      gearId: 'e2e-tenis',
      weather: { tempC: 18 + (n % 6), feelsC: 18 + (n % 6), humidity: 70, windKmh: 9, precipitationMm: 0, code: n % 3 },
    })
    activityStreams.push({
      id,
      ...meta,
      step,
      distance: Array.from({ length: points }, (_, i) => round(i * step * speed, 1)),
      hr: Array.from({ length: points }, (_, i) => Math.round(120 + Math.min(i, 120) * 0.25 + (i % 7))),
      speed: Array.from({ length: points }, (_, i) => round(speed * (0.95 + (i % 10) * 0.01), 3)),
      altitude: Array.from({ length: points }, (_, i) => round(20 + Math.sin(i / 40) * 6, 1)),
      cadence: Array.from({ length: points }, (_, i) => 164 + (i % 6)),
      ...(n % 2 === 0 && { track: Array.from({ length: 60 }, (_, i): [number, number] => [round(-30.03 + i * 0.0006, 5), round(-51.23 + Math.sin(i / 9) * 0.004, 5)]) }),
    })
  })
  // The watch's own record of two gym sessions, and a walk.
  const strengthDay = at(sessionDays[0], 18, 28)
  activities.push({
    id: 'e2e-musculacao',
    ...meta,
    sport: 'training',
    subSport: 'strength_training',
    date: strengthDay.date,
    startTime: strengthDay.time,
    elapsedSec: 66 * 60,
    timerSec: 64 * 60,
    calories: 410,
    avgHr: 112,
    maxHr: 151,
    laps: [],
    hasTrack: false,
  })
  activityStreams.push({ id: 'e2e-musculacao', ...meta, step: 10, hr: Array.from({ length: 380 }, (_, i) => 95 + ((i * 7) % 50)) })
  const walkDay = at(5, 12, 15)
  activities.push({
    id: 'e2e-caminhada',
    ...meta,
    sport: 'walking',
    date: walkDay.date,
    startTime: walkDay.time,
    elapsedSec: 2500,
    timerSec: 2400,
    distanceM: 3400,
    calories: 190,
    avgHr: 104,
    maxHr: 121,
    avgSpeed: 1.4,
    laps: [],
    hasTrack: false,
  })

  const dailyHealth: Row<DailyHealth>[] = Array.from({ length: 36 }, (_, back) => {
    const night = at(back, 6, 50 + (back % 4) * 5)
    const totalSec = Math.round((6.4 + (back % 5) * 0.35) * 3600)
    // In bed 20 minutes longer than asleep.
    const start = night.time - totalSec * 1000 - 20 * 60_000
    const stages: SleepStageSpan[] = []
    let clock = start
    const order: SleepStageSpan['stage'][] = ['light', 'deep', 'light', 'rem', 'awake', 'light', 'deep', 'light', 'rem', 'light']
    order.forEach((stage, i) => {
      const length = Math.round(((totalSec + 20 * 60) / order.length) * (0.7 + ((i * 3) % 6) / 10)) * 1000
      stages.push({ start: clock, end: Math.min(clock + length, night.time), stage })
      clock = Math.min(clock + length, night.time)
    })
    return {
      id: night.date,
      ...meta,
      sleep: {
        score: 62 + ((back * 7) % 30),
        start,
        end: night.time,
        totalSec,
        deepSec: Math.round(totalSec * 0.18),
        lightSec: Math.round(totalSec * 0.55),
        remSec: Math.round(totalSec * 0.22),
        awakeSec: Math.round(totalSec * 0.05),
        avgHr: 52 + (back % 4),
        avgRespiration: 14,
        ...(back === 3 && { napSec: 1500 }),
      },
      hrv: { lastNight: 48 + ((back * 5) % 16), weeklyAvg: 55, status: back % 6 === 0 ? 'UNBALANCED' : 'BALANCED', balancedLow: 50, balancedHigh: 62 },
      restingHr: 50 + (back % 5),
      stress: { avg: 24 + ((back * 3) % 22), max: 70 + (back % 20) },
      bodyBattery: { low: 14 + (back % 12), high: 78 + (back % 18), charged: 60, drained: 58 },
      steps: 6200 + ((back * 911) % 6000),
      calories: { total: 2450 + ((back * 53) % 500), active: 520 + ((back * 37) % 380) },
      // The older nights came from the Garmin API only, without the stages: the screen says so.
      ...(back < 20 && { sleepStages: stages }),
    }
  })

  const foods: Row<Food>[] = [
    { id: 'e2e-alimento-iogurte', ...meta, name: 'Iogurte natural', brand: 'Teste', per100: { kcal: 62, protein: 4.1, carbs: 5.2, fat: 3 }, portions: [{ label: '1 pote', grams: 170 }], source: 'custom' },
    // Registered wrong on purpose (a portion's values as if they were per 100 g): the review screen has something to show.
    { id: 'e2e-alimento-pao', ...meta, name: 'Pão de forma integral', per100: { kcal: 122, protein: 5.5, carbs: 21, fat: 1.6 }, portions: [{ label: '2 fatias', grams: 50 }], source: 'custom' },
    { id: 'e2e-alimento-barra', ...meta, name: 'Barra de proteína', per100: { kcal: 190, protein: 15, carbs: 18, fat: 7 }, unit: 'portion', source: 'health-connect' },
    { id: 'e2e-alimento-estranho', ...meta, name: 'Pasta de amendoim', per100: { kcal: 210, protein: 25, carbs: 20, fat: 50 }, source: 'custom' },
  ]
  const foodPrefs: Row<FoodPref>[] = foods.map((food, i) => ({ id: food.id, ...meta, favorite: i < 2 ? 1 : 0, lastGrams: 100, lastUsedAt: stamp - i * DAY_MS, emoji: ['🥛', '🍞', '🍫', '🥜'][i] }))
  const mealPlan: [FoodLog['meal'], number, string, string, number, FoodLog['nutrients']][] = [
    ['breakfast', 7, 'e2e-alimento-pao', 'Pão de forma integral', 50, { kcal: 122, protein: 5.5, carbs: 21, fat: 1.6, fiber: 3.2 }],
    ['breakfast', 7, 'e2e-alimento-iogurte', 'Iogurte natural', 170, { kcal: 105, protein: 7, carbs: 8.8, fat: 5.1 }],
    ['lunch', 12, 'taco:3', 'Arroz, tipo 1, cozido', 180, { kcal: 230, protein: 4.5, carbs: 50.6, fat: 0.4 }],
    ['lunch', 12, 'taco:561', 'Feijão, carioca, cozido', 140, { kcal: 106, protein: 6.7, carbs: 19, fat: 0.7, fiber: 11.9 }],
    ['lunch', 12, 'quick', 'Frango grelhado', 1, { kcal: 280, protein: 52, carbs: 0, fat: 7 }],
    ['snack', 16, 'e2e-alimento-barra', 'Barra de proteína', 1, { kcal: 190, protein: 15, carbs: 18, fat: 7 }],
    ['dinner', 20, 'quick', 'Jantar fora', 1, { kcal: 720, protein: 38, carbs: 70, fat: 30 }],
  ]
  const foodLogs: Row<FoodLog>[] = Array.from({ length: 21 }, (_, back) =>
    mealPlan
      .filter((_, i) => (back + i) % 6 !== 5)
      .map(([meal, hour, foodId, name, grams, nutrients], i): Row<FoodLog> => {
        const { date, time } = at(back, hour, 10 + i)
        const portion = foodId === 'quick' || foodId === 'e2e-alimento-barra'
        return { id: `e2e-refeicao-${date}-${i}`, ...meta, date, meal, time, foodId, name, grams, ...(portion && { unit: 'portion' as const }), nutrients }
      }),
  ).flat()
  const savedMeals: Row<SavedMeal>[] = [
    {
      id: 'e2e-refeicao-salva',
      ...meta,
      name: 'Café de sempre',
      items: [
        { foodId: 'e2e-alimento-pao', name: 'Pão de forma integral', grams: 50, nutrients: { kcal: 122, protein: 5.5, carbs: 21, fat: 1.6 } },
        { foodId: 'e2e-alimento-iogurte', name: 'Iogurte natural', grams: 170, nutrients: { kcal: 105, protein: 7, carbs: 8.8, fat: 5.1 } },
      ],
    },
  ]

  const journal: Row<JournalEntry>[] = [0, 1, 2, 4, 7, 9].map((back) => ({
    id: at(back).date,
    ...meta,
    text: back === 0 ? 'Dia tranquilo, treino leve de manhã.' : `Anotação de ${back} dias atrás: trabalho puxado, dormi tarde.`,
    mood: 3 + (back % 3),
    energy: 2 + (back % 4),
  }))
  const insights: Row<DailyInsight>[] = [
    {
      id: at(1).date,
      ...meta,
      createdAt: at(1, 8).time,
      model: 'teste',
      headline: 'Semana consistente: o sono segurou a recuperação.',
      sections: [
        { area: 'sono', title: 'Sono regular', text: 'Você dormiu perto de 7 horas na maior parte das noites.', tips: ['Manter a hora de dormir'] },
        { area: 'treino', title: 'Corrida em dia', text: 'Volume dentro do previsto, com um intervalado forte.', tips: ['Segurar o ritmo no próximo leve'] },
        { area: 'geral', title: 'Para os próximos dias', text: 'Semana de carga parecida com a anterior.', tips: [] },
      ],
    },
  ]
  const workoutPlans: Row<WorkoutPlan>[] = [
    { id: 'e2e-plano-amanha', ...meta, date: at(-1).date, templateId: 'e2e-ficha-b', time: '18:30' },
    { id: 'e2e-plano-caminhada', ...meta, date: at(-2).date, kind: 'walk', time: '07:00', targetMin: 40 },
  ]
  const pains: Row<Pain>[] = [{ id: 'e2e-dor', ...meta, name: 'Canela direita', start: at(4).date, scores: { [at(4).date]: 4, [at(2).date]: 3 } }]
  const gear: Row<Gear>[] = [{ id: 'e2e-tenis', ...meta, name: 'Tênis de teste', kind: 'shoe', startKm: 120, limitKm: 700, defaultFor: ['run'], since: at(60).date }]
  const races: Row<Race>[] = [
    { id: 'e2e-prova-futura', ...meta, name: 'Prova de teste 10 km', date: at(-20).date, time: '07:30', distanceM: 10000, goalSec: 3000 },
    { id: 'e2e-prova-feita', ...meta, name: 'Rústica de teste', date: at(runDays[2]).date, distanceM: 10000, goalSec: 3400, activityId: `e2e-corrida-${at(runDays[2]).date}` },
  ]

  const tables: Seed['file']['tables'] = {
    settings: [settings],
    weights,
    measurements,
    waterLogs,
    habits,
    habitLogs,
    workoutTemplates: [templateA, templateB],
    workoutSessions,
    foods,
    foodPrefs,
    foodLogs,
    savedMeals,
    activities,
    activityStreams,
    dailyHealth,
    journal,
    insights,
    workoutPlans,
    pains,
    gear,
    races,
  }
  return {
    file: { app: 'fitness', version: 1, exportedAt: now.toISOString(), tables },
    ids: {
      template: templateA.id,
      session: workoutSessions[0].id,
      exercise: 'ex-supino-reto-barra',
      run: `e2e-corrida-${at(runDays[0]).date}`,
      strength: 'e2e-musculacao',
    },
    rows: Object.values(tables).reduce((total, rows) => total + rows.length, 0),
  }
}
