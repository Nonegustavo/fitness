import { dayKey, type DayKey } from '../../lib/dates'

/** A planned workout from the published Garmin Connect calendar. */
export interface PlannedEvent {
  uid?: string
  date: DayKey
  /** Set when the event has a time of day, not just a date. */
  time?: number
  title: string
  description?: string
}

const unescape = (text: string) =>
  text.replace(/\\([\\;,nN])/g, (_match, char: string) => (char === 'n' || char === 'N' ? '\n' : char))

/** "20261105" (a date), "20261105T070000Z" (UTC) or "20261105T070000" (local). */
function start(value: string): { date: DayKey; time?: number } | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim())
  if (!match) return undefined
  const [, y, mo, d, h, mi, s, utc] = match
  if (h === undefined) return { date: `${y}-${mo}-${d}` }
  const time = utc
    ? Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
    : new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime()
  return { date: dayKey(time), time }
}

/** Reads the VEVENTs of an iCal feed; events without a start date are skipped. */
export function parseCalendar(text: string): PlannedEvent[] {
  // Long lines continue on the next line after a space or tab (RFC 5545 folding).
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const events: PlannedEvent[] = []
  let fields: Map<string, string> | undefined
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') fields = new Map()
    else if (line === 'END:VEVENT' && fields) {
      const when = fields.has('DTSTART') ? start(fields.get('DTSTART')!) : undefined
      const title = unescape(fields.get('SUMMARY') ?? '').trim()
      if (when && title) {
        const description = unescape(fields.get('DESCRIPTION') ?? '').trim()
        events.push({ uid: fields.get('UID'), ...when, title, description: description || undefined })
      }
      fields = undefined
    } else if (fields) {
      const colon = line.indexOf(':')
      if (colon > 0) fields.set(line.slice(0, colon).split(';')[0].toUpperCase(), line.slice(colon + 1))
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? 0) - (b.time ?? 0))
}
