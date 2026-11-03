import { describe, expect, it } from 'vitest'
import { dayKey } from '../../lib/dates'
import { parseCalendar } from './calendar'

describe('parseCalendar', () => {
  it('reads dated and timed events, unfolding long lines and escapes', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:a1',
      'DTSTART;VALUE=DATE:20261105',
      'SUMMARY:Intervalado 6x800',
      'DESCRIPTION:Aquecimento 10 min\\n6x 800 m a 4:30\\, 1:30 de trote',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:a2',
      'DTSTART:20261104T093000Z',
      'SUMMARY:Rodagem',
      '  leve 8 km',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:a3',
      'SUMMARY:Sem data',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const at = Date.UTC(2026, 10, 4, 9, 30)

    expect(parseCalendar(ics)).toEqual([
      { uid: 'a2', date: dayKey(at), time: at, title: 'Rodagem leve 8 km' },
      {
        uid: 'a1',
        date: '2026-11-05',
        title: 'Intervalado 6x800',
        description: 'Aquecimento 10 min\n6x 800 m a 4:30, 1:30 de trote',
      },
    ])
  })
})
