import Dexie, { type Table } from 'dexie'
import { DEFAULT_EXERCISES } from './defaultExercises'
import type {
  Activity,
  ActivityStream,
  DailyHealth,
  DailyInsight,
  EventTime,
  Exercise,
  Food,
  FoodLog,
  FoodPref,
  Gear,
  Habit,
  HabitLog,
  JournalEntry,
  MeasurementEntry,
  MeasurementSite,
  Pain,
  PhotoBlob,
  SavedMeal,
  Settings,
  Synced,
  WaterContainer,
  WaterLog,
  WeightEntry,
  WorkoutPlan,
  WorkoutSession,
  ProgressPhoto,
  Race,
  WorkoutTemplate,
} from './types'

/** Tables mirrored to the server. Each name doubles as the remote `collection`. */
export const SYNCED_TABLES = [
  'weights',
  'measurements',
  'waterContainers',
  'waterLogs',
  'habits',
  'habitLogs',
  'settings',
  'exercises',
  'workoutTemplates',
  'workoutSessions',
  'foods',
  'foodLogs',
  'foodPrefs',
  'savedMeals',
  'activities',
  'activityStreams',
  'dailyHealth',
  'journal',
  'insights',
  'progressPhotos',
  'workoutPlans',
  'eventTimes',
  'pains',
  'gear',
  'races',
] as const

export type SyncedTableName = (typeof SYNCED_TABLES)[number]

export const isSyncedTable = (name: string): name is SyncedTableName =>
  (SYNCED_TABLES as readonly string[]).includes(name)

/** Local-only key/value rows (sync cursor and the like). */
export interface MetaRow {
  key: string
  value: unknown
}

export const SETTINGS_ID = 'settings'

/** Meta key holding the last server rev this device has pulled. */
export const PULL_CURSOR = 'pullCursor'

export const DEFAULT_MEASUREMENT_SITES: MeasurementSite[] = [
  { key: 'neck', label: 'Pescoço' },
  { key: 'chest', label: 'Peito' },
  { key: 'arm_r', label: 'Braço direito' },
  { key: 'arm_l', label: 'Braço esquerdo' },
  { key: 'waist', label: 'Cintura' },
  { key: 'abdomen', label: 'Abdômen' },
  { key: 'hip', label: 'Quadril' },
  { key: 'thigh_r', label: 'Coxa direita' },
  { key: 'thigh_l', label: 'Coxa esquerda' },
  { key: 'calf_r', label: 'Panturrilha direita' },
  { key: 'calf_l', label: 'Panturrilha esquerda' },
]

export const DEFAULT_SETTINGS: Omit<Settings, keyof Synced> = {
  waterGoalMl: 3000,
  measurementSites: DEFAULT_MEASUREMENT_SITES,
}

// Seeded rows use fixed ids and updatedAt 0: every device creates the same rows,
// and any edit synced from another device replaces them.
const seedMeta = { updatedAt: 0, deleted: 0, dirty: 0 } as const

const DEFAULT_CONTAINERS: WaterContainer[] = [
  { id: 'default-glass', name: 'Copo', ml: 250, icon: 'glass', favorite: 1, order: 0, ...seedMeta },
  { id: 'default-bottle', name: 'Garrafa', ml: 500, icon: 'bottle', favorite: 1, order: 1, ...seedMeta },
  { id: 'default-mug', name: 'Caneca', ml: 350, icon: 'mug', favorite: 0, order: 2, ...seedMeta },
]

export class FitnessDB extends Dexie {
  weights!: Table<WeightEntry, string>
  measurements!: Table<MeasurementEntry, string>
  waterContainers!: Table<WaterContainer, string>
  waterLogs!: Table<WaterLog, string>
  habits!: Table<Habit, string>
  habitLogs!: Table<HabitLog, string>
  settings!: Table<Settings, string>
  exercises!: Table<Exercise, string>
  workoutTemplates!: Table<WorkoutTemplate, string>
  workoutSessions!: Table<WorkoutSession, string>
  foods!: Table<Food, string>
  foodLogs!: Table<FoodLog, string>
  foodPrefs!: Table<FoodPref, string>
  savedMeals!: Table<SavedMeal, string>
  activities!: Table<Activity, string>
  activityStreams!: Table<ActivityStream, string>
  dailyHealth!: Table<DailyHealth, string>
  journal!: Table<JournalEntry, string>
  insights!: Table<DailyInsight, string>
  photos!: Table<PhotoBlob, string>
  progressPhotos!: Table<ProgressPhoto, string>
  workoutPlans!: Table<WorkoutPlan, string>
  eventTimes!: Table<EventTime, string>
  pains!: Table<Pain, string>
  gear!: Table<Gear, string>
  races!: Table<Race, string>
  meta!: Table<MetaRow, string>

  constructor(name = 'fitness') {
    super(name)
    // When adding a synced table, bump the version and delete the pull cursor in
    // the upgrade, so records that newer clients already pushed get pulled again.
    this.version(1).stores({
      weights: 'id, date, dirty',
      measurements: 'id, date, dirty',
      waterContainers: 'id, dirty',
      waterLogs: 'id, date, dirty',
      habits: 'id, dirty',
      habitLogs: 'id, date, habitId, dirty',
      settings: 'id, dirty',
      meta: 'key',
    })
    this.version(2)
      .stores({
        exercises: 'id, dirty',
        workoutTemplates: 'id, dirty',
        workoutSessions: 'id, date, dirty',
      })
      .upgrade(async (tx) => {
        await tx.table('exercises').bulkAdd(DEFAULT_EXERCISES)
        await tx.table('meta').delete(PULL_CURSOR)
      })
    this.version(3)
      .stores({
        foods: 'id, barcode, dirty',
        foodLogs: 'id, date, dirty',
        foodPrefs: 'id, dirty',
        savedMeals: 'id, dirty',
      })
      .upgrade(async (tx) => {
        await tx.table('meta').delete(PULL_CURSOR)
      })
    this.version(4)
      .stores({
        activities: 'id, startTime, dirty',
        activityStreams: 'id, dirty',
      })
      .upgrade(async (tx) => {
        await tx.table('meta').delete(PULL_CURSOR)
      })
    this.version(5)
      .stores({ dailyHealth: 'id, dirty' })
      .upgrade(async (tx) => {
        await tx.table('meta').delete(PULL_CURSOR)
      })
    // `photos` stays on the device: the images go to the server's storage, not to the records table.
    this.version(6)
      .stores({ journal: 'id, dirty', insights: 'id, dirty', photos: 'id, pending' })
      .upgrade(async (tx) => {
        await tx.table('meta').delete(PULL_CURSOR)
      })
    this.version(7)
      .stores({ progressPhotos: 'id, date, dirty' })
      .upgrade(async (tx) => {
        await tx.table('meta').delete(PULL_CURSOR)
      })
    this.version(8)
      .stores({ workoutPlans: 'id, date, dirty' })
      .upgrade(async (tx) => {
        await tx.table('meta').delete(PULL_CURSOR)
      })
    this.version(9)
      .stores({ eventTimes: 'id, date, dirty' })
      .upgrade(async (tx) => {
        await tx.table('meta').delete(PULL_CURSOR)
      })
    this.version(10)
      .stores({ pains: 'id, start, dirty' })
      .upgrade(async (tx) => {
        await tx.table('meta').delete(PULL_CURSOR)
      })
    this.version(11)
      .stores({ gear: 'id, dirty' })
      .upgrade(async (tx) => {
        await tx.table('meta').delete(PULL_CURSOR)
      })
    this.version(12)
      .stores({ races: 'id, date, dirty' })
      .upgrade(async (tx) => {
        await tx.table('meta').delete(PULL_CURSOR)
      })
    // An index only, no new table: the pull cursor stays. It lets the records' cache see which samples
    // changed from the keys alone ([id, updatedAt]), without loading the rows.
    this.version(13).stores({ activityStreams: 'id, dirty, [id+updatedAt]' })
    // Runs instead of the upgrades when the database is created from scratch.
    this.on('populate', (tx) => {
      tx.table('settings').add({ id: SETTINGS_ID, ...DEFAULT_SETTINGS, ...seedMeta })
      tx.table('waterContainers').bulkAdd(DEFAULT_CONTAINERS)
      tx.table('exercises').bulkAdd(DEFAULT_EXERCISES)
    })
  }
}

export const db = new FitnessDB()
