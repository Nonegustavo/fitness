import type { Activity } from '../../db/types'
import type { PlannedEvent } from '../garmin/calendar'
import { eventTitle } from './agenda'

/** What a line of a workout's description is about, which picks its mark. */
export type TextLineKind = 'warmup' | 'cooldown' | 'recovery' | 'repeat' | 'step'

/** A line of the workout as the calendar describes it: "Aquecimento 10 min", "Repetir 3x", "1 km a 5:20". */
export interface TextLine {
  text: string
  /** 1 for a line indented under the one before (a step inside a repeat). */
  depth: number
  kind: TextLineKind
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  bull: '•',
  middot: '·',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  deg: '°',
}

const character = (code: number) => (Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '')

/**
 * The description as plain text. Garmin's calendar has sent workout steps with HTML entities ("&#8226;"
 * for the bullet), and a feed escaped twice leaves "\n" as text; HTML line breaks become new lines and
 * other tags go. Only real tags: "FC <150 e >140" stays as it is.
 */
export function plainDescription(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(?:p|div|li|h\d)\s*>/gi, '\n')
    .replace(/<\s*li\b[^<>]*>/gi, '• ')
    .replace(/<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/gi, '')
    .replace(/&#(\d+);/g, (_match, code: string) => character(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => character(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
}

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** How a line reads: warm-up and cool-down by name, a repeat by its count alone, a jog or rest as recovery. */
function lineKind(text: string): TextLineKind {
  const words = plain(text)
  if (/^(?:repet\w*|repita|repeat)\b/.test(words) || /^\d+\s*(?:x|×|vezes|times)\s*:?$/.test(words)) return 'repeat'
  if (/desaquec|volta a calma|cool ?down|soltura|alongament|stretch/.test(words)) return 'cooldown'
  if (/aquec|warm ?up/.test(words)) return 'warmup'
  if (/recupera|\btrote\b|descans|pausa|recover|\brest\b/.test(words)) return 'recovery'
  return 'step'
}

/** Spaces at the start of a line, a tab counting as two. */
const indentOf = (line: string) => (/^[ \t]*/.exec(line)?.[0] ?? '').replace(/\t/g, '  ').length

/**
 * The lines of a workout's description, one step each: bullets ("•", "-", "1.") taken off, empty lines
 * dropped, and a line indented two spaces more than the least indented one read as inside the line
 * above (a repeat's steps). Bullets in the middle of a line start a step too.
 */
export function descriptionLines(description: string | undefined): TextLine[] {
  if (!description?.trim()) return []
  const rows = plainDescription(description)
    .split('\n')
    .filter((line) => line.trim())
  const least = Math.min(...rows.map(indentOf))
  return rows.flatMap((line) => {
    const depth = indentOf(line) >= least + 2 ? 1 : 0
    return line
      .trim()
      .split(/(?:^|\s+)•\s*/)
      .map((part) => part.replace(/^(?:[-–—*·>]\s+|\d{1,2}[.)]\s+)/, '').trim())
      .filter(Boolean)
      .map((text) => ({ text, depth, kind: lineKind(text) }))
  })
}

/** The description in a line, for lists: "Aquecimento 10 min · Repetir 3x · 1,2 km a 5:22". */
export const descriptionPreview = (description: string): string =>
  descriptionLines(description)
    .map((line) => line.text)
    .join(' · ')

/**
 * The kind of run a coach's workout is, from its name: "Corrida Intervalado ativo 4,48 - 4,97 Km" is
 * "intervalado ativo", "Corrida Fartlek 6 Km" is "fartlek", and "Corrida 7 Km" is "" (a steady run).
 * Whatever comes before SisRUN's day ("Gravataí - 03/11 Ter - …", as the watch names the activity) goes
 * too, so a planned workout and a done one compare.
 */
export function runType(name: string): string {
  const fromDay = name.replace(/^.*?(?=\b\d{1,2}\/\d{1,2}\b)/, '')
  return plain(eventTitle(fromDay))
    .replace(/^corrida\b\s*[-–:]?\s*/, '')
    .replace(/\(?\s*\d+(?:[.,]\d+)?\s*(?:(?:-|–|a|ate)\s*\d+(?:[.,]\d+)?)?\s*(?:km|k)?\s*\)?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The latest run before the workout's day that followed a coach's workout of the same kind (another
 * "Intervalado ativo"), to show how the last one went. Races and other sports have none.
 */
export function lastSimilarRun(event: Pick<PlannedEvent, 'title' | 'date'>, activities: Activity[]): Activity | undefined {
  const type = runType(event.title)
  let found: Activity | undefined
  for (const activity of activities) {
    if (activity.deleted || activity.sport !== 'running' || !activity.workout || activity.date >= event.date) continue
    if (found && activity.startTime <= found.startTime) continue
    if (runType(activity.workout.name ?? activity.title ?? '') === type) found = activity
  }
  return found
}
