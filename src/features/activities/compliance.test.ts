import { describe, expect, it } from 'vitest'
import type { ActivityLap, PlannedStep } from '../../db/types'
import { checkSummary, checkWorkout, stepLabel, targetCheck, unrollSteps } from './compliance'

/** 4:30–4:40 /km as Garmin sends it: m/s, the slow end low. */
const PACE = { targetType: 'SPEED', targetValue: 0, targetLow: 1000 / 280, targetHigh: 1000 / 270 }

const intervals: PlannedStep[] = [
  { index: 0, intensity: 'WARMUP', durationType: 'TIME', durationValue: 600, targetType: 'HEART_RATE', targetLow: 230, targetHigh: 245 },
  { index: 1, intensity: 'INTERVAL', durationType: 'DISTANCE', durationValue: 800, ...PACE },
  { index: 2, intensity: 'RECOVERY', durationType: 'TIME', durationValue: 90, targetType: 'OPEN' },
  { index: 3, durationType: 'REPEAT_UNTIL_STEPS_CMPLT', durationValue: 1, targetValue: 6 },
  { index: 4, intensity: 'COOLDOWN', durationType: 'OPEN' },
]

let clock = 0
const lap = (timerSec: number, distanceM: number, avgHr = 150): ActivityLap => {
  clock += timerSec * 1000
  return { startTime: clock, elapsedSec: timerSec, timerSec, distanceM, avgSpeed: distanceM / timerSec, avgHr }
}
/** An 800 m rep at a pace in seconds per km. */
const rep = (pace: number, meters = 800) => lap((pace * meters) / 1000, meters, 165)

const run = (laps: ActivityLap[], steps = intervals) => ({ sport: 'running', workout: { steps }, laps })

/** Warm-up, the six reps at these paces with their recoveries, and the cool-down. */
const followed = (paces: number[]) => [
  lap(600, 1800, 140),
  ...paces.flatMap((pace) => [rep(pace), lap(90, 220, 150)]),
  lap(420, 1100, 135),
]

describe('unrolling a workout', () => {
  it('runs a repeat its count of times, numbering the rounds', () => {
    const steps = unrollSteps(intervals)!
    expect(steps).toHaveLength(14)
    expect(steps.map((step) => step.step.index)).toEqual([0, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 4])
    expect(steps[5]).toMatchObject({ round: 3, rounds: 6 })
    expect(steps[0].round).toBeUndefined()
    expect(stepLabel(steps[5])).toBe('Tiro 3/6')
    expect(stepLabel(steps[6])).toBe('Recuperação 3/6')
    expect(stepLabel(steps[13])).toBe('Desaquecimento')
  })

  it('handles a repeat inside another, restarting the inner count', () => {
    const nested: PlannedStep[] = [
      { index: 0, intensity: 'WARMUP', durationType: 'TIME', durationValue: 600 },
      { index: 1, intensity: 'INTERVAL', durationType: 'DISTANCE', durationValue: 400 },
      { index: 2, intensity: 'RECOVERY', durationType: 'TIME', durationValue: 60 },
      { index: 3, durationType: 'REPEAT_UNTIL_STEPS_CMPLT', durationValue: 1, targetValue: 3 },
      { index: 4, intensity: 'REST', durationType: 'TIME', durationValue: 180 },
      { index: 5, durationType: 'REPEAT_UNTIL_STEPS_CMPLT', durationValue: 1, targetValue: 2 },
      { index: 6, intensity: 'COOLDOWN', durationType: 'OPEN' },
    ]
    const steps = unrollSteps(nested)!
    expect(steps.map((step) => step.step.index)).toEqual([0, 1, 2, 1, 2, 1, 2, 4, 1, 2, 1, 2, 1, 2, 4, 6])
    expect(steps.filter((step) => step.step.index === 1).map((step) => step.round)).toEqual([1, 2, 3, 1, 2, 3])
    expect(steps.filter((step) => step.step.index === 4).map((step) => `${step.round}/${step.rounds}`)).toEqual(['1/2', '2/2'])
  })

  it('gives up on a repeat that points nowhere or forward', () => {
    expect(unrollSteps([{ index: 0, durationType: 'TIME', durationValue: 60 }, { index: 1, durationType: 'REPEAT_UNTIL_STEPS_CMPLT', durationValue: 7, targetValue: 2 }])).toBeUndefined()
    expect(unrollSteps([{ index: 0, durationType: 'REPEAT_UNTIL_STEPS_CMPLT', durationValue: 1, targetValue: 2 }, { index: 1, durationType: 'OPEN' }])).toBeUndefined()
  })
})

describe('planned against done', () => {
  it('lines up one lap per step and judges each rep against its pace', () => {
    const check = checkWorkout(run(followed([275, 272, 285, 266, 280, 270])))!
    expect(check.status).toBe('aligned')
    expect(check.extraLaps).toBe(0)
    const reps = check.steps.filter((step) => step.step.index === 1)
    expect(reps.map((step) => step.target)).toEqual(['ok', 'ok', 'slow', 'fast', 'ok', 'ok'])
    expect(reps.every((step) => step.length === 'ok')).toBe(true)
    // The warm-up has its own target (130–145 bpm), but the count is about the reps.
    expect(check.steps[0].target).toBe('ok')
    expect(checkSummary(check)).toBe('4 de 6 tiros no alvo (1 mais lento, 1 mais rápido)')
  })

  it('counts a pace that reads as the end of the range as inside it', () => {
    // 4:40.4 /km reads 4:40.
    expect(targetCheck(intervals[1], rep(280.4), true)).toBe('ok')
    expect(targetCheck(intervals[1], rep(280.6), true)).toBe('slow')
    expect(targetCheck(intervals[2], rep(280), true)).toBeUndefined()
  })

  it('leaves out the laps recorded after the workout ended', () => {
    const laps = [...followed([275, 275, 275, 275, 275, 275]), lap(25, 40)]
    const check = checkWorkout(run(laps))!
    expect(check).toMatchObject({ status: 'aligned', extraLaps: 1, laps: 15 })
    expect(checkSummary(check)).toBe('6 de 6 tiros no alvo')
  })

  it('finds the workout after a lap run before it started', () => {
    const laps = [lap(300, 900), ...followed([275, 275, 275, 275, 275, 275])]
    const check = checkWorkout(run(laps))!
    expect(check.status).toBe('aligned')
    expect(check.steps[0].lap).toBe(laps[1])
  })

  it('says when the activity ended before the last steps, and which rep was cut', () => {
    const laps = [lap(600, 1800, 140), rep(275), lap(90, 220), rep(275), lap(90, 220), rep(275), lap(90, 220), rep(276, 500)]
    const check = checkWorkout(run(laps))!
    expect(check.status).toBe('ended')
    expect(check.steps[7]).toMatchObject({ length: 'short', target: 'ok' })
    expect(check.steps[8].lap).toBeUndefined()
    expect(checkSummary(check)).toBe('4 de 4 tiros no alvo; 1 tiro encurtado; treino encerrado antes do fim: faltaram 6 de 14 etapas')
  })

  it('refuses to compare when the laps are the watch splitting every km', () => {
    const laps = Array.from({ length: 8 }, () => lap(300, 1000))
    const check = checkWorkout(run(laps))!
    expect(check.status).toBe('mismatch')
    expect(check.steps.every((step) => step.lap === undefined)).toBe(true)
    expect(checkSummary(check)).toBe('as voltas não batem com as etapas do treino (8 voltas para 14 etapas)')
  })

  it('checks heart rate targets in bpm, as a share of the maximum and by zone', () => {
    const zones = [100, 120, 140, 155, 170, 190]
    const step = (fields: Partial<PlannedStep>): PlannedStep => ({ index: 0, durationType: 'TIME', durationValue: 600, targetType: 'HEART_RATE', ...fields })
    const at = (hr: number) => lap(600, 1500, hr)
    expect(targetCheck(step({ targetLow: 240, targetHigh: 250 }), at(152), true)).toBe('high')
    expect(targetCheck(step({ targetLow: 70, targetHigh: 80 }), at(140), true, zones)).toBe('ok') // 133–152 bpm
    expect(targetCheck(step({ targetLow: 70, targetHigh: 80 }), at(140), true)).toBeUndefined()
    expect(targetCheck(step({ targetValue: 2 }), at(118), true, zones)).toBe('low') // zone 2: 121–140
  })

  it('reports the steps done when the workout has no targets', () => {
    const steady: PlannedStep[] = [
      { index: 0, intensity: 'WARMUP', durationType: 'TIME', durationValue: 600 },
      { index: 1, intensity: 'ACTIVE', durationType: 'DISTANCE', durationValue: 5000 },
      { index: 2, intensity: 'COOLDOWN', durationType: 'OPEN' },
    ]
    const check = checkWorkout(run([lap(600, 1700), lap(1600, 5000), lap(300, 800)], steady))!
    expect(checkSummary(check)).toBe('todas as 3 etapas feitas')
  })

  it('calls them "etapas" when the targets are on steps outside repeats', () => {
    const tempo: PlannedStep[] = [
      { index: 0, intensity: 'WARMUP', durationType: 'TIME', durationValue: 600 },
      { index: 1, intensity: 'ACTIVE', durationType: 'DISTANCE', durationValue: 3000, ...PACE },
      { index: 2, intensity: 'ACTIVE', durationType: 'DISTANCE', durationValue: 2000, ...PACE },
    ]
    const check = checkWorkout(run([lap(600, 1700), rep(290, 3000), rep(286, 2000)], tempo))!
    expect(checkSummary(check)).toBe('0 de 2 etapas no alvo (2 mais lentas)')
  })

  it('works out the count of a repeat that runs until a time from the laps', () => {
    const open: PlannedStep[] = [
      { index: 0, intensity: 'INTERVAL', durationType: 'DISTANCE', durationValue: 400, ...PACE },
      { index: 1, intensity: 'RECOVERY', durationType: 'TIME', durationValue: 60 },
      { index: 2, durationType: 'REPEAT_UNTIL_TIME', durationValue: 0, targetValue: 1200 },
    ]
    const laps = [rep(275, 400), lap(60, 150), rep(275, 400), lap(60, 150), rep(275, 400), lap(60, 150)]
    const check = checkWorkout(run(laps, open))!
    expect(check.status).toBe('aligned')
    expect(checkSummary(check)).toBe('3 de 3 tiros no alvo')
  })

  it('has nothing to compare without a structured workout', () => {
    expect(checkWorkout({ sport: 'running', laps: [] })).toBeUndefined()
  })
})
