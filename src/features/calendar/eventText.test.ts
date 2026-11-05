import { describe, expect, it } from 'vitest'
import type { Activity } from '../../db/types'
import { parseCalendar } from '../garmin/calendar'
import { eventDistance, eventKm } from './agenda'
import { descriptionLines, lastSimilarRun, plainDescription, runType } from './eventText'

describe('plainDescription', () => {
  it('turns HTML entities, line breaks and double escapes back into text', () => {
    expect(plainDescription('&#8226; Corrida&nbsp;leve<br>&#x2022; 5 min &amp; trote')).toBe('• Corrida leve\n• 5 min & trote')
    expect(plainDescription('Aquecimento\\n3x 1 km\\, forte')).toBe('Aquecimento\n3x 1 km, forte')
    expect(plainDescription('<p>Tiros</p><ul><li>400 m</li></ul>')).toBe('Tiros\n• 400 m\n')
  })

  it('keeps comparisons that only look like tags', () => {
    expect(plainDescription('FC <150 e >140')).toBe('FC <150 e >140')
  })
})

describe('descriptionLines', () => {
  it('reads Garmin calendar steps, one per bullet', () => {
    // As a Garmin calendar sent them: an escaped comma, a folded line, bullets as HTML entities.
    const [event] = parseCalendar(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261106',
        'SUMMARY:W01D1-Recovery Run',
        'DESCRIPTION:&#8226; Run in Z2\\, recovery pace\\, 40 minutes.\\n &#8226; Cool down\\, 5 t',
        ' o 10 minutes.\\n &#8226; Stretch.',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    )
    expect(descriptionLines(event.description)).toEqual([
      { text: 'Run in Z2, recovery pace, 40 minutes.', depth: 0, kind: 'recovery' },
      { text: 'Cool down, 5 to 10 minutes.', depth: 0, kind: 'cooldown' },
      { text: 'Stretch.', depth: 0, kind: 'cooldown' },
    ])
  })

  it('nests the steps indented under a repeat and names each kind', () => {
    const text = ['Aquecimento: 10 min trote leve', 'Repetir 3x', '  - 1,2 km a 5:22–5:29 /km', '  - 1:45 recuperação', 'Desaquecimento 5 min'].join('\n')
    expect(descriptionLines(text)).toEqual([
      { text: 'Aquecimento: 10 min trote leve', depth: 0, kind: 'warmup' },
      { text: 'Repetir 3x', depth: 0, kind: 'repeat' },
      { text: '1,2 km a 5:22–5:29 /km', depth: 1, kind: 'step' },
      { text: '1:45 recuperação', depth: 1, kind: 'recovery' },
      { text: 'Desaquecimento 5 min', depth: 0, kind: 'cooldown' },
    ])
  })

  it('splits bullets in the middle of a line and drops numbering and empty lines', () => {
    expect(descriptionLines('• 15 min leve • 8x 400 m forte\n\n1. Soltar 5 min').map((line) => [line.text, line.kind])).toEqual([
      ['15 min leve', 'step'],
      ['8x 400 m forte', 'step'],
      ['Soltar 5 min', 'step'],
    ])
    expect(descriptionLines('3 vezes:').map((line) => line.kind)).toEqual(['repeat'])
  })

  it('is empty without a description', () => {
    expect(descriptionLines(undefined)).toEqual([])
    expect(descriptionLines('  \n ')).toEqual([])
    expect(descriptionLines('<br>')).toEqual([])
  })
})

describe('eventDistance', () => {
  it('reads the distance range of a workout name, with or without the unit', () => {
    expect(eventDistance('06/11 Sex - Corrida Intervalado ativo 4,48 - 4,97 Km')).toEqual({ low: 4.48, high: 4.97 })
    expect(eventDistance('Rústica de Morungava 2026 (6 a 8km)')).toEqual({ low: 6, high: 8 })
    expect(eventDistance('08/11 Dom - Corrida 7 Km')).toEqual({ low: 7, high: 7 })
    expect(eventDistance('20/10 Ter - Corrida 3,725 - 4,48')).toEqual({ low: 3.725, high: 4.48 })
    expect(eventDistance('11/10 Dom - Corrida Fartlek 5,59')).toEqual({ low: 5.59, high: 5.59 })
  })

  it('leaves out numbers that are not kilometers', () => {
    expect(eventDistance('Intervalado 10x400 m')).toBeUndefined()
    expect(eventDistance('Corrida 2026')).toBeUndefined()
    expect(eventDistance('03/11 Ter - Corrida Intervalado')).toBeUndefined()
  })

  it('gives eventKm the longer end', () => {
    expect(eventKm('20/10 Ter - Corrida 3,725 - 4,48')).toBe(4.48)
    expect(eventKm('Fartlek 8 a 6 km')).toBe(8)
  })
})

describe('runType', () => {
  it('keeps the kind of run, without the day, "Corrida" and the distance', () => {
    expect(runType('06/11 Sex - Corrida Intervalado ativo 4,48 - 4,97 Km')).toBe('intervalado ativo')
    expect(runType('Gravataí - 03/11 Ter - Corrida Intervalado')).toBe('intervalado')
    expect(runType('01/11 Dom - Corrida Fartlek 6 Km')).toBe('fartlek')
    expect(runType('11/10 Dom - Corrida Fartlek 5,59')).toBe('fartlek')
    expect(runType('08/11 Dom - Corrida 7 Km')).toBe('')
    expect(runType('20/10 Ter - Corrida 3,725 - 4,48')).toBe('')
  })
})

describe('lastSimilarRun', () => {
  const run = (id: string, date: string, name: string | undefined, changes: Partial<Activity> = {}): Activity =>
    ({
      id,
      date,
      sport: 'running',
      startTime: Date.parse(`${date}T07:00:00`),
      title: `Gravataí - ${name ?? 'Corrida'}`,
      ...(name && { workout: { name, steps: [] } }),
      timerSec: 1800,
      elapsedSec: 1800,
      laps: [],
      updatedAt: 1,
      deleted: 0,
      dirty: 0,
      ...changes,
    }) as Activity

  const activities = [
    run('a', '2026-10-28', '28/10 Ter - Corrida Intervalado ativo 4,2 Km'),
    run('b', '2026-11-03', '03/11 Ter - Corrida Intervalado'),
    run('c', '2026-10-31', '31/10 Sex - Corrida Intervalado ativo 4,48 - 4,97 Km'),
    run('d', '2026-11-02', undefined),
    run('e', '2026-11-04', '04/11 Qua - Corrida Intervalado ativo', { deleted: 1 }),
    run('f', '2026-11-06', '06/11 Sex - Corrida Intervalado ativo 4,48 - 4,97 Km'),
    run('g', '2026-11-01', '01/11 Dom - Corrida Intervalado ativo', { sport: 'cycling' }),
  ]

  it('finds the latest run of the same kind before the day, that followed a coach workout', () => {
    const event = { title: '06/11 Sex - Corrida Intervalado ativo 4,48 - 4,97 Km', date: '2026-11-06' }
    expect(lastSimilarRun(event, activities)?.id).toBe('c')
    expect(lastSimilarRun({ title: '07/11 Sáb - Corrida Intervalado', date: '2026-11-07' }, activities)?.id).toBe('b')
    expect(lastSimilarRun({ title: '08/11 Dom - Corrida Longão 12 Km', date: '2026-11-08' }, activities)).toBeUndefined()
  })
})
