import { describe, expect, it } from 'vitest'
import type { Activity, EventTime, Race, WorkoutPlan, WorkoutSession, WorkoutTemplate } from '../../db/types'
import { dayTime } from '../../lib/dates'
import {
  buildAgenda,
  eventKey,
  eventKind,
  eventKm,
  eventTitle,
  hiddenEvents,
  isRace,
  keyedEvents,
  nextRace,
  shortTitle,
  suggestTemplate,
  visibleEvents,
  weekSummary,
  type AgendaSources,
} from './agenda'

const meta = { updatedAt: 1, deleted: 0, dirty: 0 } as const
const TODAY = '2026-11-05'

const template = (id: string, order: number, archived?: 1): WorkoutTemplate => ({
  id,
  name: id.toUpperCase(),
  exercises: [],
  order,
  ...(archived && { archived }),
  ...meta,
})
const templates = [template('legs', 0), template('pull', 1), template('push', 2), template('old', 3, 1)]

const plan = (id: string, date: string, templateId: string, time?: string): WorkoutPlan => ({
  id,
  date,
  templateId,
  ...(time && { time }),
  ...meta,
})

const session = (id: string, date: string, templateId: string | undefined, ended = true): WorkoutSession => ({
  id,
  date,
  templateId,
  name: templateId ? templateId.toUpperCase() : 'Treino livre',
  startedAt: dayTime(date, '18:00'),
  ...(ended && { endedAt: dayTime(date, '19:00') }),
  exercises: [],
  ...meta,
})

const activity = (id: string, date: string, sport: string, subSport?: string): Activity => ({
  id,
  date,
  sport,
  subSport,
  startTime: dayTime(date, '07:00'),
  elapsedSec: 3000,
  timerSec: 2900,
  laps: [],
  hasTrack: false,
  ...meta,
})

const sources = (changes: Partial<AgendaSources>): AgendaSources => ({
  plans: [],
  events: null,
  sessions: [],
  activities: [],
  templates,
  ...changes,
})

describe('eventKind', () => {
  it('reads runs, rides, swims, strength and rest days from the names', () => {
    expect(eventKind({ title: 'Rodagem 8 km' })).toBe('run')
    expect(eventKind({ title: 'Intervalado', description: '10x400 m' })).toBe('run')
    expect(eventKind({ title: 'Pedal leve' })).toBe('ride')
    expect(eventKind({ title: 'Natação técnica' })).toBe('swim')
    expect(eventKind({ title: 'Treino de força' })).toBe('gym')
    expect(eventKind({ title: 'Descanso' })).toBe('rest')
    expect(eventKind({ title: 'Caminhada' })).toBe('walk')
  })
})

describe('eventTitle and shortTitle', () => {
  it('drop the day SisRUN puts before the name, and the kind the icon shows in tight spots', () => {
    expect(eventTitle('06/11 Sex - Corrida Intervalado ativo 4,48 - 4,97 Km')).toBe('Corrida Intervalado ativo 4,48 - 4,97 Km')
    expect(eventTitle('08/11 Dom - Corrida 7 Km')).toBe('Corrida 7 Km')
    expect(eventTitle('Rústica de Morungava 2026 (6 a 8km)')).toBe('Rústica de Morungava 2026 (6 a 8km)')
    expect(shortTitle({ kind: 'run', title: 'Corrida 7 Km' })).toBe('7 Km')
    expect(shortTitle({ kind: 'run', title: 'Corrida Intervalado ativo' })).toBe('Intervalado ativo')
    expect(shortTitle({ kind: 'run', title: 'Corrida' })).toBe('Corrida')
    expect(shortTitle({ kind: 'gym', title: 'PULL DAY' })).toBe('PULL DAY')
  })
})

describe('buildAgenda', () => {
  it('marks a scheduled template done by a workout of it that day, and the others planned or missed', () => {
    const items = buildAgenda(
      '2026-11-03',
      '2026-11-07',
      TODAY,
      sources({
        plans: [
          plan('p1', '2026-11-03', 'legs'),
          plan('p2', '2026-11-04', 'pull'),
          plan('p3', '2026-11-05', 'push', '18:30'),
          plan('p4', '2026-11-07', 'legs'),
        ],
        sessions: [session('s1', '2026-11-03', 'legs'), session('s2', '2026-11-04', 'push')],
      }),
    )
    expect(items.map((item) => [item.date, item.title, item.status])).toEqual([
      ['2026-11-03', 'LEGS', 'done'],
      // Another template was done that day: the plan was missed and the workout is listed apart.
      ['2026-11-04', 'PUSH', 'done'],
      ['2026-11-04', 'PULL', 'missed'],
      ['2026-11-05', 'PUSH', 'planned'],
      ['2026-11-07', 'LEGS', 'planned'],
    ])
    expect(items.find((item) => item.plan?.id === 'p3')?.time).toBe(dayTime('2026-11-05', '18:30'))
  })

  it('shows a workout in progress and counts a plan done on the watch only', () => {
    const items = buildAgenda(
      '2026-11-04',
      TODAY,
      TODAY,
      sources({
        plans: [plan('p1', '2026-11-04', 'pull'), plan('p2', TODAY, 'push')],
        sessions: [session('s1', TODAY, 'push', false)],
        activities: [activity('a1', '2026-11-04', 'training', 'strengthTraining')],
      }),
    )
    expect(items.map((item) => [item.title, item.status, item.activity?.id ?? item.session?.id])).toEqual([
      ['PULL', 'done', 'a1'],
      ['PUSH', 'active', 's1'],
    ])
  })

  it('matches the Garmin workouts with the activities of the same kind and keeps the rest', () => {
    const items = buildAgenda(
      '2026-11-04',
      '2026-11-06',
      TODAY,
      sources({
        events: [
          { date: '2026-11-04', title: 'Rodagem 8 km' },
          { date: TODAY, title: 'Intervalado' },
          { date: '2026-11-06', title: 'Descanso' },
        ],
        sessions: [session('s1', TODAY, 'legs')],
        activities: [
          activity('run', '2026-11-04', 'running'),
          { ...activity('bike', '2026-11-04', 'cycling'), startTime: dayTime('2026-11-04', '17:00') },
          // The watch's record of the gym workout of the app: not listed twice.
          activity('gym', TODAY, 'training', 'strengthTraining'),
        ],
      }),
    )
    expect(items.map((item) => [item.date, item.kind, item.status, item.activity?.id])).toEqual([
      ['2026-11-04', 'run', 'done', 'run'],
      ['2026-11-04', 'ride', 'done', 'bike'],
      [TODAY, 'gym', 'done', undefined],
      [TODAY, 'run', 'planned', undefined],
      ['2026-11-06', 'rest', 'planned', undefined],
    ])
  })
})

describe('the time set for a Garmin workout', () => {
  const event = { uid: 'u1', date: '2026-11-06', title: '06/11 Sex - Corrida 7 Km' }
  const key = 't:06/11 sex - corrida 7 km|2026-11-06'

  it('replaces the calendar time (or the lack of one) and is kept on the item', () => {
    const [item] = buildAgenda(
      '2026-11-06',
      '2026-11-06',
      TODAY,
      sources({ events: [event], eventTimes: [{ id: key, date: '2026-11-06', time: '06:45', ...meta }] }),
    )
    expect(item).toMatchObject({ eventKey: key, customTime: '06:45', time: dayTime('2026-11-06', '06:45') })
    const [deleted] = buildAgenda(
      '2026-11-06',
      '2026-11-06',
      TODAY,
      sources({ events: [event], eventTimes: [{ id: key, date: '2026-11-06', time: '06:45', ...meta, deleted: 1 }] }),
    )
    expect(deleted.customTime).toBeUndefined()
    expect(deleted.time).toBeUndefined()
  })

  it('survives the calendar making up a new UID on the next fetch', () => {
    const times = [{ id: key, date: '2026-11-06', time: '08:00', ...meta }]
    const [first] = buildAgenda('2026-11-06', '2026-11-06', TODAY, sources({ events: [event], eventTimes: times }))
    const refetched = { ...event, uid: '20261107T055653Z-1746190823@172.23.128.1' }
    const [again] = buildAgenda('2026-11-06', '2026-11-06', TODAY, sources({ events: [refetched], eventTimes: times }))
    expect(again).toMatchObject({ key: first.key, eventKey: first.eventKey, customTime: '08:00' })
  })

  it('still uses a time saved under an old UID key when the day has a single Garmin workout', () => {
    const old = [
      { id: '20261107T011333Z-1746190823@172.23.128.1|2026-11-06', date: '2026-11-06', time: '07:30', ...meta, updatedAt: 1 },
      { id: '20261107T051944Z-1746190823@172.23.128.1|2026-11-06', date: '2026-11-06', time: '08:00', ...meta, updatedAt: 2 },
    ]
    const [item] = buildAgenda('2026-11-06', '2026-11-06', TODAY, sources({ events: [event], eventTimes: old }))
    expect(item.customTime).toBe('08:00')
    const two = [event, { ...event, uid: 'u2', title: '06/11 Sex - Educativos' }]
    expect(buildAgenda('2026-11-06', '2026-11-06', TODAY, sources({ events: two, eventTimes: old })).map((i) => i.customTime)).toEqual([
      undefined,
      undefined,
    ])
  })
})

describe('eventKm, isRace and nextRace', () => {
  it('read the distance of a workout name, the longer end of a range', () => {
    expect(eventKm('06/11 Sex - Corrida Intervalado ativo 4,48 - 4,97 Km')).toBe(4.97)
    expect(eventKm('08/11 Dom - Corrida 7 Km')).toBe(7)
    expect(eventKm('Rústica de Morungava 2026 (6 a 8km)')).toBe(8)
    expect(eventKm('Intervalado 10x400 m')).toBeUndefined()
  })

  it('tell the races apart from the SisRUN workouts and find the next one', () => {
    const race = { date: '2026-11-08', title: 'Rústica de Morungava 2026 (6 a 8km)' }
    const workout = { date: '2026-11-08', title: '08/11 Dom - Corrida 7 Km' }
    expect(isRace(race)).toBe(true)
    expect(isRace(workout)).toBe(false)
    expect(isRace({ title: 'Fisioterapia' })).toBe(false)
    expect(nextRace([workout, race, { date: '2026-10-20', title: 'Meia de Porto Alegre' }], TODAY)).toBe(race)
    expect(nextRace(null, TODAY)).toBeUndefined()
  })
})

describe('weekSummary', () => {
  it('counts the workouts done of all, the running distance against the planned and the time', () => {
    const items = buildAgenda(
      '2026-11-01',
      '2026-11-07',
      TODAY,
      sources({
        plans: [plan('p1', '2026-11-03', 'legs'), plan('p2', '2026-11-07', 'pull')],
        sessions: [session('s1', '2026-11-03', 'legs')],
        events: [
          { date: '2026-11-04', title: '04/11 Qua - Corrida 6 Km' },
          { date: '2026-11-06', title: '06/11 Sex - Corrida Intervalado ativo 4,48 - 4,97 Km' },
          { date: '2026-11-07', title: 'Descanso' },
        ],
        activities: [{ ...activity('a1', '2026-11-04', 'running'), distanceM: 6020, timerSec: 2280 }],
      }),
    )
    // The plan of the week: the 6,02 km already run and the 4,97 km still to do.
    expect(weekSummary(items)).toEqual({ done: 2, total: 4, runKm: 6.02, plannedRunKm: 10.99, walkKm: 0, trainedSec: 3600 + 2280 })
  })

  it('counts a walk as a workout, with its km apart from the running', () => {
    const items = buildAgenda(
      '2026-11-01',
      '2026-11-07',
      TODAY,
      sources({
        plans: [walk('w1', '2026-11-03'), walk('w2', '2026-11-06')],
        activities: [
          { ...activity('a1', '2026-11-03', 'walking'), distanceM: 3200, timerSec: 2400 },
          { ...activity('a2', '2026-11-04', 'running'), distanceM: 5000, timerSec: 1700 },
        ],
      }),
    )
    expect(weekSummary(items)).toEqual({ done: 2, total: 3, runKm: 5, walkKm: 3.2, trainedSec: 2400 + 1700 })
  })
})

const walk = (id: string, date: string, changes: Partial<WorkoutPlan> = {}): WorkoutPlan => ({
  id,
  date,
  kind: 'walk',
  ...meta,
  ...changes,
})

describe('walks in the agenda', () => {
  it('is done by a walk or a hike that day, the one nearest the planned time, and never by a run or the gym', () => {
    const items = buildAgenda(
      '2026-11-03',
      TODAY,
      TODAY,
      sources({
        plans: [
          walk('w1', '2026-11-03', { targetMin: 40 }),
          walk('w2', '2026-11-04', { targetKm: 3 }),
          walk('w3', TODAY, { time: '18:00' }),
          plan('p1', '2026-11-04', 'legs'),
        ],
        activities: [
          activity('run', '2026-11-03', 'running'),
          activity('hike', '2026-11-04', 'hiking'),
          activity('morning', TODAY, 'walking'),
          { ...activity('evening', TODAY, 'walking'), startTime: dayTime(TODAY, '18:10') },
        ],
      }),
    )
    expect(items.map((item) => [item.date, item.kind, item.title, item.status, item.activity?.id])).toEqual([
      ['2026-11-03', 'run', 'Corrida', 'done', 'run'],
      ['2026-11-03', 'walk', 'Caminhada de 40 min', 'missed', undefined],
      ['2026-11-04', 'walk', 'Caminhada de 3 km', 'done', 'hike'],
      // The hike isn't the gym workout: the plan stays undone.
      ['2026-11-04', 'gym', 'LEGS', 'missed', undefined],
      // The morning walk is listed on its own, the evening one did the 18:00 walk.
      [TODAY, 'walk', 'Caminhada', 'done', 'morning'],
      [TODAY, 'walk', 'Caminhada', 'done', 'evening'],
    ])
    expect(items.find((item) => item.plan?.id === 'w3')?.activity?.id).toBe('evening')
  })

  it('keeps the walks out of the gym rotation', () => {
    const history = { templates, sessions: [session('s1', '2026-11-03', 'legs')], plans: [walk('w1', TODAY)] }
    expect(suggestTemplate('2026-11-06', TODAY, history)?.id).toBe('pull')
  })
})

describe('the weekly walk', () => {
  // Monday, Wednesday and Friday at 07:00, since Tuesday the 3rd.
  const walkRoutine = { days: [1, 3, 5], time: '07:00', targetMin: 40, since: '2026-11-03' }
  const weekly = (changes: Partial<AgendaSources> = {}) =>
    buildAgenda('2026-11-01', '2026-11-14', TODAY, sources({ walkRoutine, ...changes })).filter((item) => item.kind === 'walk')

  it('appears by itself on its weekdays from the day it started, with fixed ids', () => {
    const items = weekly({ activities: [activity('a1', '2026-11-04', 'walking')] })
    expect(items.map((item) => [item.date, item.status, item.key])).toEqual([
      ['2026-11-04', 'done', 'plan-walk-2026-11-04'],
      ['2026-11-06', 'planned', 'plan-walk-2026-11-06'],
      ['2026-11-09', 'planned', 'plan-walk-2026-11-09'],
      ['2026-11-11', 'planned', 'plan-walk-2026-11-11'],
      ['2026-11-13', 'planned', 'plan-walk-2026-11-13'],
    ])
    expect(items[1]).toMatchObject({ title: 'Caminhada de 40 min', repeats: true, time: dayTime('2026-11-06', '07:00') })
  })

  it('takes a day changed on its own and leaves out a day taken off', () => {
    const items = weekly({
      plans: [
        walk('walk-2026-11-11', '2026-11-11', { time: '18:00' }),
        walk('walk-2026-11-13', '2026-11-13', { time: '07:00', deleted: 1 }),
        // Not a day of the routine (a Tuesday): ignored.
        walk('walk-2026-11-10', '2026-11-10', { time: '07:00' }),
        // A walk on its own, apart from the routine.
        walk('extra', '2026-11-10', { time: '19:00' }),
      ],
    })
    expect(items.map((item) => [item.date, item.title, item.plan?.time, item.repeats ?? false])).toEqual([
      ['2026-11-04', 'Caminhada de 40 min', '07:00', true],
      ['2026-11-06', 'Caminhada de 40 min', '07:00', true],
      ['2026-11-09', 'Caminhada de 40 min', '07:00', true],
      ['2026-11-10', 'Caminhada', '19:00', false],
      ['2026-11-11', 'Caminhada', '18:00', true],
    ])
  })

  it('starts today when its first day is unknown, and is gone when there is no routine', () => {
    expect(weekly({ walkRoutine: { days: [3, 5] } }).map((item) => item.date)).toEqual(['2026-11-06', '2026-11-11', '2026-11-13'])
    expect(weekly({ walkRoutine: undefined })).toEqual([])
    expect(weekly({ walkRoutine: { days: [] } })).toEqual([])
  })
})

describe('Garmin workouts listed twice', () => {
  const race = { date: '2026-11-08', title: 'Rústica de Morungava (6 a 8km)', time: dayTime('2026-11-08', '08:00') }
  const fromSisrun = { ...race, description: 'Prova alvo' }
  const base = eventKey(race)

  it('get their own keys, the same on the next fetch whatever the order and the UIDs', () => {
    const first = keyedEvents([{ ...fromSisrun, uid: 'a' }, { ...race, uid: 'b' }])
    expect(first.map(({ event, key }) => [event.uid, key])).toEqual([
      ['a', `${base}#2`],
      ['b', base],
    ])
    const again = keyedEvents([{ ...race, uid: 'c' }, { ...fromSisrun, uid: 'd' }])
    expect(again.map(({ event, key }) => [event.description, key])).toEqual([
      [undefined, base],
      ['Prova alvo', `${base}#2`],
    ])
    const items = buildAgenda('2026-11-08', '2026-11-08', TODAY, sources({ events: [race, fromSisrun] }))
    expect(items.map((item) => item.key)).toEqual([`event-${base}`, `event-${base}#2`])
  })

  it('can each be hidden on their day, and leave every list until brought back', () => {
    const hidden: EventTime[] = [{ id: `${base}#2`, date: '2026-11-08', hidden: true, ...meta }]
    const events = [race, fromSisrun, { date: '2026-11-09', title: 'Rodagem 5 km' }]
    const items = buildAgenda('2026-11-08', '2026-11-09', TODAY, sources({ events, eventTimes: hidden }))
    expect(items.map((item) => [item.date, item.eventKey])).toEqual([
      ['2026-11-08', base],
      ['2026-11-09', 't:rodagem 5 km|2026-11-09'],
    ])
    expect(visibleEvents(events, hidden)).toEqual([race, events[2]])
    expect(hiddenEvents(events, hidden)).toEqual([{ event: fromSisrun, key: `${base}#2` }])
    // Brought back (the row deleted) or never hidden: listed again.
    expect(visibleEvents(events, [{ ...hidden[0], deleted: 1 }])).toEqual(events)
    expect(visibleEvents(null, hidden)).toBeNull()
  })

  it('keep the planned time of a hidden workout apart from hiding it', () => {
    const times: EventTime[] = [
      { id: base, date: '2026-11-08', time: '07:30', ...meta },
      { id: `${base}#2`, date: '2026-11-08', time: '07:30', hidden: true, ...meta },
    ]
    const [item] = buildAgenda('2026-11-08', '2026-11-08', TODAY, sources({ events: [race, fromSisrun], eventTimes: times }))
    expect(item).toMatchObject({ eventKey: base, customTime: '07:30', time: dayTime('2026-11-08', '07:30') })
  })

  // The Android background check numbers the copies too (SisrunWatch.kt, keyed), ordering the
  // descriptions as Kotlin compares strings: by UTF-16 code unit, so capitals come before lower case
  // and accented letters after "z". An alphabetical order here ("aquecimento", "Único", "Zona") would
  // make this side's "#2" the other side's "#3".
  const copies = ['aquecimento e 6 tiros', 'Único treino forte da semana', undefined, 'Zona 2 contínuo'].map((description) => ({
    ...race,
    description,
  }))

  it('are numbered as the Android side numbers them: by time, then by the code units of the description', () => {
    expect(keyedEvents(copies).map(({ event, key }) => [event.description, key])).toEqual([
      ['aquecimento e 6 tiros', `${base}#3`],
      ['Único treino forte da semana', `${base}#4`],
      // Without a description: the empty string there, before every other.
      [undefined, base],
      ['Zona 2 contínuo', `${base}#2`],
    ])
    // The time still comes first, and a copy without one before the ones with it.
    const early = { ...race, time: dayTime('2026-11-08', '07:00'), description: 'ritmo de prova' }
    const allDay = { date: race.date, title: race.title, description: 'Único treino forte da semana' }
    expect(keyedEvents([race, early, allDay]).map(({ key }) => key)).toEqual([`${base}#3`, `${base}#2`, base])
  })

  it('are hidden and timed by those numbers, each on the copy the Android side means', () => {
    const [warmUp, only, bare] = copies
    const times: EventTime[] = [
      { id: `${base}#2`, date: '2026-11-08', hidden: true, ...meta },
      { id: `${base}#3`, date: '2026-11-08', time: '07:30', ...meta },
    ]
    // "#2" is the "Zona 2" copy, which leaves; "#3" is the warm-up one, planned at 07:30.
    expect(visibleEvents(copies, times)).toEqual([warmUp, only, bare])
    const items = buildAgenda('2026-11-08', '2026-11-08', TODAY, sources({ events: copies, eventTimes: times }))
    expect(items.map((item) => [item.event?.description, item.customTime])).toEqual([
      ['aquecimento e 6 tiros', '07:30'],
      [undefined, undefined],
      ['Único treino forte da semana', undefined],
    ])
  })
})

describe('suggestTemplate', () => {
  it('follows the rotation after the last workout done or scheduled before that day', () => {
    const history = { templates, sessions: [session('s1', '2026-11-03', 'legs')], plans: [plan('p1', '2026-11-06', 'pull')] }
    expect(suggestTemplate(TODAY, TODAY, history)?.id).toBe('pull')
    expect(suggestTemplate('2026-11-08', TODAY, history)?.id).toBe('push')
    // After the last of the rotation it starts over; archived templates are skipped.
    expect(suggestTemplate('2026-11-08', TODAY, { ...history, plans: [plan('p2', '2026-11-06', 'push')] })?.id).toBe('legs')
  })

  it('ignores past plans that were not done and starts the rotation without history', () => {
    const plans = [plan('p1', '2026-11-04', 'pull')]
    expect(suggestTemplate(TODAY, TODAY, { templates, sessions: [session('s1', '2026-11-01', 'legs')], plans })?.id).toBe('pull')
    expect(suggestTemplate(TODAY, TODAY, { templates, sessions: [], plans: [] })?.id).toBe('legs')
  })
})

describe('the races of the app in the calendar', () => {
  const RACE_DAY = '2026-11-08'
  const race = (changes: Partial<Race> = {}): Race => ({ id: 'r1', name: 'Rústica de Morungava', date: RACE_DAY, rangeM: [6000, 8000], ...meta, ...changes })
  const run = (id: string, km: number, time: string): Activity => ({ ...activity(id, RACE_DAY, 'running'), startTime: dayTime(RACE_DAY, time), distanceM: km * 1000 })
  const events = [
    { date: RACE_DAY, title: 'Rústica de Morungava (6 a 8km)' },
    { date: RACE_DAY, title: '08/11 Dom - Corrida 7 km' },
    { date: RACE_DAY, title: 'Musculação' },
  ]

  it('stand for the Garmin runs of their day, done by the longest run', () => {
    const items = buildAgenda(RACE_DAY, RACE_DAY, '2026-11-09', sources({ events, races: [race()], activities: [run('warmup', 1.5, '08:20'), run('race', 6.24, '09:04')] }))
    // The race brought from the calendar and the coach's workout for it are the race; the gym stays.
    expect(items.map((item) => [item.title, item.status, item.activity?.id])).toEqual([
      ['Corrida', 'done', 'warmup'],
      ['Rústica de Morungava', 'done', 'race'],
      ['Musculação', 'missed', undefined],
    ])
    expect(items.find((item) => item.race)?.key).toBe('race-r1')
  })

  it('take the run linked to them, or none', () => {
    const runs = [run('warmup', 1.5, '08:20'), run('race', 6.24, '09:04')]
    const linked = buildAgenda(RACE_DAY, RACE_DAY, '2026-11-09', sources({ races: [race({ activityId: 'warmup' })], activities: runs }))
    expect(linked.find((item) => item.race)?.activity?.id).toBe('warmup')
    const none = buildAgenda(RACE_DAY, RACE_DAY, '2026-11-09', sources({ races: [race({ activityId: '-' })], activities: runs }))
    expect(none.find((item) => item.race)?.status).toBe('missed')
  })

  it('count their distance in the week planned, ahead', () => {
    const items = buildAgenda('2026-11-08', '2026-11-14', '2026-11-08', sources({ races: [race({ time: '08:00' })] }))
    expect(items[0]).toMatchObject({ title: 'Rústica de Morungava', status: 'planned', time: dayTime(RACE_DAY, '08:00') })
    expect(weekSummary(items).plannedRunKm).toBe(8)
  })

  it('leave the days without them alone', () => {
    const items = buildAgenda(RACE_DAY, RACE_DAY, RACE_DAY, sources({ events, races: [race({ date: '2026-11-15' })] }))
    expect(items.map((item) => item.title)).toEqual(['Corrida 7 km', 'Musculação', 'Rústica de Morungava (6 a 8km)'])
  })
})
