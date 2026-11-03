import { describe, expect, it } from 'vitest'
import { describeStep, toPlannedWorkout, workoutBlocks, type GarminWorkout } from './workout'

const intervals: GarminWorkout[] = [
  {
    workoutName: 'Intervalado 6x800',
    steps: [
      { stepIndex: 0, intensity: 'WARMUP', durationType: 'TIME', durationValue: 600, targetType: 'HEART_RATE', targetValue: 0, targetValueLow: 230, targetValueHigh: 245 },
      { stepIndex: 1, intensity: 'INTERVAL', durationType: 'DISTANCE', durationValue: 800, targetType: 'SPEED', targetValue: 0, targetValueLow: 1000 / 280, targetValueHigh: 1000 / 270 },
      { stepIndex: 2, intensity: 'RECOVERY', durationType: 'TIME', durationValue: 90, targetType: 'OPEN' },
      { stepIndex: 3, durationType: 'REPEAT_UNTIL_STEPS_CMPLT', durationValue: 1, targetValue: 6 },
      { stepIndex: 4, intensity: 'COOLDOWN', durationType: 'OPEN', notes: 'Trote leve' },
    ],
  },
]

describe('planned workouts', () => {
  const workout = toPlannedWorkout(intervals)!

  it('keeps the workout with steps', () => {
    expect(workout.name).toBe('Intervalado 6x800')
    expect(workout.steps).toHaveLength(5)
    expect(toPlannedWorkout(null)).toBeUndefined()
    expect(toPlannedWorkout([{ steps: [] }])).toBeUndefined()
  })

  it('groups the steps a repeat points back to', () => {
    const blocks = workoutBlocks(workout.steps)
    expect(blocks.map((block) => block.kind)).toEqual(['step', 'repeat', 'step'])
    expect(blocks[1]).toMatchObject({ kind: 'repeat', times: 6, steps: [{ index: 1 }, { index: 2 }] })
  })

  it('reads targets as a runner does: pace, heart rate in bpm', () => {
    expect(describeStep(workout.steps[0], true)).toEqual({ title: 'Aquecimento', detail: '10 min · FC 130–145 bpm' })
    expect(describeStep(workout.steps[1], true)).toEqual({ title: 'Esforço', detail: '800 m · 4:30–4:40 /km' })
    expect(describeStep(workout.steps[2], true)).toEqual({ title: 'Recuperação', detail: '1:30' })
    expect(describeStep(workout.steps[4], true)).toEqual({ title: 'Desaquecimento', detail: 'até apertar volta' })
  })

  it('shows speed on a bike, and zones or percentages when that is the target', () => {
    expect(describeStep({ index: 0, durationType: 'TIME', durationValue: 1200, targetType: 'SPEED', targetLow: 7.5, targetHigh: 8.333 }, false).detail).toBe(
      '20 min · 27–30 km/h',
    )
    expect(describeStep({ index: 0, targetType: 'HEART_RATE', targetLow: 70, targetHigh: 80 }, true).detail).toBe('FC 70–80% da máx.')
    expect(describeStep({ index: 0, targetType: 'POWER', targetValue: 3 }, false).detail).toBe('zona 3 de potência')
    expect(describeStep({ index: 0, name: 'Tiro', durationType: 'DISTANCE', durationValue: 1500 }, true)).toEqual({ title: 'Tiro', detail: '1,5 km' })
  })
})
