import { useLiveQuery } from 'dexie-react-hooks'
import { alive, mutate, remove, restore, save, type Draft } from '../../db/repo'
import { db } from '../../db/schema'
import type { Pain } from '../../db/types'
import { daysBetween, formatDay, shiftDay, type DayKey } from '../../lib/dates'

export const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export const clampScore = (score: number): number => Math.min(10, Math.max(1, Math.round(score)))

/** How bad a score is, in words. */
export function intensity(score: number): string {
  if (score <= 3) return 'leve'
  if (score <= 6) return 'moderada'
  return score <= 8 ? 'forte' : 'muito forte'
}

/** Whether a pain is going on that day: from its start until it ended. */
export const isActiveOn = (pain: Pick<Pain, 'start' | 'end'>, date: DayKey): boolean =>
  pain.start <= date && (pain.end === undefined || date <= pain.end)

/** The day a day's score comes from: that day, or the last one before it with a score. */
export function scoreDay(pain: Pick<Pain, 'scores'>, date: DayKey): DayKey | undefined {
  let found: DayKey | undefined
  for (const day of Object.keys(pain.scores)) if (day <= date && (found === undefined || day > found)) found = day
  return found
}

/** A day's score: the one given that day, or else the last one before it. */
export function scoreOn(pain: Pick<Pain, 'scores'>, date: DayKey): number | undefined {
  const day = scoreDay(pain, date)
  return day === undefined ? undefined : pain.scores[day]
}

/** The pains going on that day, the oldest first. */
export const painsOn = (pains: Pain[], date: DayKey): Pain[] =>
  pains.filter((pain) => isActiveOn(pain, date)).sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** The row to save, without the sync fields (save sets them). */
function draftOf({ updatedAt: _u, deleted: _d, dirty: _x, ...pain }: Pain): Draft<Pain> & { id: string } {
  return pain
}

/** A pain with a day's score set. */
export function withScore(pain: Pain, date: DayKey, score: number): Pain {
  return { ...pain, scores: { ...pain.scores, [date]: clampScore(score) } }
}

/**
 * What adding a pain on a day saves: one of the same name going on that day gets the day's score,
 * one starting later starts on this day instead, and anything else is a new pain from this day on.
 */
export function addition(pains: Pain[], name: string, score: number, date: DayKey): Draft<Pain> {
  const clean = name.trim().replace(/\s+/g, ' ')
  const named = pains.filter((pain) => normalize(pain.name) === normalize(clean))
  const going = named.find((pain) => isActiveOn(pain, date))
  if (going) return draftOf(withScore(going, date, score))
  const later = named.filter((pain) => pain.start > date).sort((a, b) => a.start.localeCompare(b.start))[0]
  if (later) return { ...draftOf(withScore(later, date, score)), start: date }
  return { name: clean, start: date, scores: { [date]: clampScore(score) } }
}

/**
 * What removing a pain on a day does: on the day it started it goes away; on a later day it ends the
 * day before, keeping the scores up to then.
 */
export function removal(pain: Pain, date: DayKey): { kind: 'delete' } | { kind: 'end'; pain: Pain } {
  if (date <= pain.start) return { kind: 'delete' }
  const end = shiftDay(date, -1)
  const scores = Object.fromEntries(Object.entries(pain.scores).filter(([day]) => day <= end))
  return { kind: 'end', pain: { ...pain, end, scores } }
}

/** Names told before, the most recent first, that match what's typed and aren't going on that day. */
export function painSuggestions(pains: Pain[], date: DayKey, typed: string, max = 6): string[] {
  const query = normalize(typed)
  const taken = new Set(pains.filter((pain) => isActiveOn(pain, date)).map((pain) => normalize(pain.name)))
  const recent = (pain: Pain) => pain.end ?? '9999-12-31'
  const names: string[] = []
  for (const pain of [...pains].sort((a, b) => recent(b).localeCompare(recent(a)))) {
    const key = normalize(pain.name)
    if (taken.has(key) || key === query || (query && !key.includes(query))) continue
    taken.add(key)
    names.push(pain.name)
    if (names.length === max) break
  }
  return names
}

// ---------------------------------------------------------------- for the daily analysis

/** "canela direita 4/10, lombar 2/10": the pains of a day with their scores. */
export function painsText(pains: Pain[], date: DayKey): string | undefined {
  const parts = painsOn(pains, date).flatMap((pain) => {
    const score = scoreOn(pain, date)
    return score === undefined ? [] : [`${pain.name} ${score}/10`]
  })
  return parts.length > 0 ? parts.join(', ') : undefined
}

const short = (date: DayKey) => formatDay(date, 'd/MM')
const MAX_STEPS = 10

/** Each change of score with its day ("6 em 28/10, 4 em 3/11"), the middle left out when long. */
function evolution(pain: Pain, until: DayKey): string {
  const steps: [DayKey, number][] = []
  for (const [day, score] of Object.entries(pain.scores).sort(([a], [b]) => a.localeCompare(b))) {
    if (day > until) break
    if (steps.at(-1)?.[1] !== score) steps.push([day, score])
  }
  const text = (list: [DayKey, number][]) => list.map(([day, score]) => `${score} em ${short(day)}`).join(', ')
  if (steps.length <= MAX_STEPS) return text(steps)
  const worst = Math.max(...steps.map(([, score]) => score))
  return `${text(steps.slice(0, 1))}, …, ${text(steps.slice(-(MAX_STEPS - 2)))} (pior ${worst}/10)`
}

const daysText = (count: number) => `${count} ${count === 1 ? 'dia' : 'dias'}`

/**
 * The diary's pains for the daily analysis: the ones going on, with how their scores went since they
 * started, and the ones that ended in the last `recentDays`.
 */
export function painLines(pains: Pain[], today: DayKey, recentDays = 30): string[] {
  const shown = pains
    .filter((pain) => pain.start <= today && (pain.end === undefined || pain.end >= shiftDay(today, -recentDays)))
    .sort((a, b) => Number(a.end !== undefined && a.end < today) - Number(b.end !== undefined && b.end < today) || a.start.localeCompare(b.start))
  return shown.map((pain) => {
    const last = pain.end !== undefined && pain.end < today ? pain.end : today
    const span = daysText(daysBetween(pain.start, last) + 1)
    const when =
      last === today
        ? `desde ${short(pain.start)} (${span}), hoje ${scoreOn(pain, today)}/10`
        : `de ${short(pain.start)} a ${short(last)} (${span}), já passou`
    return `- ${pain.name}: ${when}; notas: ${evolution(pain, last)}`
  })
}

// ---------------------------------------------------------------- storage

/** Every pain told in the diary. */
export const usePains = (): Pain[] | undefined => useLiveQuery(async () => alive(await db.pains.toArray()))

export async function addPain(name: string, score: number, date: DayKey): Promise<void> {
  await save(db.pains, addition(alive(await db.pains.toArray()), name, score, date))
}

export async function setPainScore(pain: Pain, date: DayKey, score: number): Promise<void> {
  await mutate(db.pains, pain.id, (row) => withScore(row, date, score))
}

/** Removes a pain on a day (see `removal`); resolves to what puts it back as it was. */
export async function removePain(pain: Pain, date: DayKey): Promise<() => Promise<void>> {
  const result = removal(pain, date)
  if (result.kind === 'delete') {
    await remove(db.pains, pain.id)
    return () => restore(db.pains, pain.id)
  }
  await save(db.pains, draftOf(result.pain))
  return async () => {
    await save(db.pains, draftOf(pain))
  }
}
