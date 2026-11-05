import type { Equipment, GymSetup, PerformedSet, SetKind } from '../../db/types'
import { newId } from '../../lib/ids'
import { formatSet } from './catalog'
import { DEFAULT_GYM, LOAD_STEP } from './stats'

/** A warm-up set before the working sets. */
export interface WarmupSet {
  weightKg: number
  reps: number
}

/** After the empty bar: about 40%, 60% and 80% of the working load. */
const BAR_STEPS = [
  { share: 0.4, reps: 8 },
  { share: 0.6, reps: 5 },
  { share: 0.8, reps: 3 },
]
const BAR_REPS = 10
/** Dumbbells, machines and cables: about half, then three quarters. */
const LOAD_STEPS = [
  { share: 0.5, reps: 10 },
  { share: 0.75, reps: 6 },
]
/** A step closer than this share of the working load to the one before adds nothing. */
const MIN_JUMP = 0.1

/** Loaded on a bar with plates, as the plate calculator takes it. */
export const usesBar = (equipment: Equipment): boolean => equipment === 'barbell' || equipment === 'smith'

/** The load nearest `kg` that the bar and pairs of the gym's plates make; a tie goes to the lighter. */
export function nearestBarLoad(kg: number, gym: GymSetup): number {
  const unit = 0.25
  const target = (kg - gym.barKg) / 2 / unit
  const sizes = [...new Set(gym.plates.map((plate) => Math.round(plate / unit)).filter((size) => size > 0))]
  if (target <= 0 || sizes.length === 0) return gym.barKg
  // Which amounts per side the plates make, up to a plate past the target.
  const limit = Math.ceil(target) + Math.max(...sizes)
  const reachable = [true]
  let best = 0
  for (let amount = 1; amount <= limit; amount++) {
    reachable[amount] = sizes.some((size) => size <= amount && reachable[amount - size])
    if (reachable[amount] && Math.abs(amount - target) < Math.abs(best - target)) best = amount
  }
  return gym.barKg + 2 * best * unit
}

/**
 * Warm-up sets before a working load, as Strong suggests them. On a bar (or the Smith): the empty bar
 * for 10 when it's at most 80% of the load, then about 40% for 8, 60% for 5 and 80% for 3 at loads the
 * gym's plates make, leaving out the steps the bar already covers or that come too close to the one
 * before, so 2 to 4 sets as the load grows. Dumbbells, machines and cables: about 50% for 10 and 75%
 * for 6, to the equipment's step. None at body weight, or when the load is too light to warm up under.
 */
export function suggestWarmup(workKg: number, equipment: Equipment, gym: GymSetup = DEFAULT_GYM): WarmupSet[] {
  const step = LOAD_STEP[equipment]
  if (!(workKg > 0) || step === 0) return []
  const toStep = (kg: number) => Math.round(Math.round(kg / step) * step * 100) / 100
  const bar = usesBar(equipment)
  const sets: WarmupSet[] =
    bar && gym.barKg > 0 && gym.barKg <= workKg * 0.8 ? [{ weightKg: gym.barKg, reps: BAR_REPS }] : []
  for (const { share, reps } of bar ? BAR_STEPS : LOAD_STEPS) {
    const kg = bar ? nearestBarLoad(toStep(workKg * share), gym) : toStep(workKg * share)
    // A bar can't go lighter than itself: steps under it are left out.
    const before = sets.at(-1)?.weightKg ?? (bar ? gym.barKg : 0)
    if (kg > before && kg - before >= workKg * MIN_JUMP && kg < workKg) sets.push({ weightKg: kg, reps })
  }
  return sets
}

/** "20×10 · 40×8 · 60×5 · 80×3". */
export const formatWarmup = (warmup: WarmupSet[]): string =>
  warmup.map((set) => formatSet(set, 'weight_reps')).join(' · ')

/** The first working set's load: typed, or last time's same set, or the template's. */
export function firstWorkingLoad(sets: PerformedSet[], previous: (PerformedSet | undefined)[]): number | undefined {
  const i = sets.findIndex((set) => set.kind === 'normal')
  if (i < 0) return undefined
  return sets[i].weightKg ?? previous[i]?.weightKg ?? sets[i].target?.weightKg
}

/** Warm-up sets of a workout, with their loads and reps already filled in. */
export const warmupSets = (warmup: WarmupSet[]): PerformedSet[] =>
  warmup.map(({ weightKg, reps }) => ({ key: newId(), kind: 'warmup', weightKg, reps, done: false }))

/**
 * The sets with the warm-ups not done yet replaced: the new ones go before the working sets, after the
 * warm-ups already done.
 */
export function replaceWarmups<T extends { kind: SetKind; done?: boolean }>(sets: T[], warmups: T[]): T[] {
  const kept = sets.filter((set) => set.kind !== 'warmup' || set.done)
  const first = kept.findIndex((set) => set.kind === 'normal')
  const at = first < 0 ? kept.length : first
  return [...kept.slice(0, at), ...warmups, ...kept.slice(at)]
}
