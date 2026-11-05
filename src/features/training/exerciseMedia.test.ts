import { describe, expect, it } from 'vitest'
import { DEFAULT_EXERCISES, DEFAULT_MEDIA } from '../../db/defaultExercises'
import { mediaDetail, mediaIdOf, mediaImages, mediaLabel, noMedia, searchMedia, searchTerms, type MediaEntry } from './exerciseMedia'
import { STEPS_PT } from './exerciseSteps'

const entry = (id: string, changes: Partial<MediaEntry> = {}): MediaEntry => ({
  id,
  name: id.replace(/_/g, ' '),
  equipment: 'barbell',
  primaryMuscles: ['chest'],
  instructions: [],
  images: [`${id}/0.jpg`, `${id}/1.jpg`],
  category: 'strength',
  ...changes,
})

describe('the default library', () => {
  it('has pictures and Portuguese steps for every exercise', () => {
    for (const exercise of DEFAULT_EXERCISES) {
      const mediaId = mediaIdOf(exercise)
      expect(mediaId, exercise.name).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(STEPS_PT[mediaId!]?.length, exercise.name).toBeGreaterThanOrEqual(2)
    }
    expect(Object.keys(DEFAULT_MEDIA)).toHaveLength(DEFAULT_EXERCISES.length)
  })
})

describe('mediaIdOf', () => {
  it("takes the user's link, then the default library's; empty means none", () => {
    expect(mediaIdOf({ id: 'ex-prancha' })).toBe('Plank')
    expect(mediaIdOf({ id: 'ex-prancha', mediaId: 'Side_Bridge' })).toBe('Side_Bridge')
    expect(mediaIdOf({ id: 'ex-prancha', mediaId: '' })).toBeUndefined()
    expect(mediaIdOf({ id: 'mine' })).toBeUndefined()
    expect(noMedia('ex-prancha')).toBe('')
    expect(noMedia('mine')).toBeUndefined()
  })

  it('points at the start and end pictures', () => {
    expect(mediaImages('Plank')).toEqual([
      'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Plank/0.jpg',
      'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Plank/1.jpg',
    ])
    expect(mediaLabel('Dips_-_Chest_Version')).toBe('Dips - Chest Version')
  })
})

describe('searchMedia', () => {
  const all = [
    entry('Barbell_Bench_Press_-_Medium_Grip'),
    entry('Decline_Barbell_Bench_Press'),
    entry('Incline_Dumbbell_Press', { equipment: 'dumbbell' }),
    entry('Dumbbell_Bench_Press', { equipment: 'dumbbell' }),
    entry('Barbell_Shoulder_Press', { primaryMuscles: ['shoulders'] }),
    entry('Leg_Press', { equipment: 'machine', primaryMuscles: ['quadriceps'] }),
    entry('EZ-Bar_Curl', { name: 'EZ-Bar Curl', equipment: 'e-z curl bar' }),
    entry('Barbell_Curl'),
  ]
  const names = (query: string) => searchMedia(all, query).map((e) => e.id)

  it('reads Portuguese gym names', () => {
    expect(names('Supino reto com barra').slice(0, 2)).toEqual(['Barbell_Bench_Press_-_Medium_Grip', 'Decline_Barbell_Bench_Press'])
    // "Inclinado" weighs more than a press that is merely a supino.
    expect(names('Supino inclinado com halteres')[0]).toBe('Incline_Dumbbell_Press')
    expect(names('Rosca direta barra W')[0]).toBe('EZ-Bar_Curl')
    expect(names('Leg press 45°')[0]).toBe('Leg_Press')
  })

  it('searches in English too, and finds nothing without words', () => {
    expect(names('shoulder press')[0]).toBe('Barbell_Shoulder_Press')
    expect(searchMedia(all, '  ')).toEqual([])
    expect(searchTerms('Elevação lateral com halteres')).toEqual([
      ['lateral raise', 'side lateral', 'deltoid raise'],
      ['dumbbell'],
    ])
  })

  it('describes an entry in Portuguese', () => {
    expect(mediaDetail(entry('Leg_Press', { equipment: 'machine', primaryMuscles: ['quadriceps'] }))).toBe('Quadríceps · Máquina')
    expect(mediaDetail(entry('X', { equipment: null, primaryMuscles: ['abdominals'] }))).toBe('Abdômen')
  })
})
