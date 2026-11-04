import { FunctionsHttpError } from '@supabase/supabase-js'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import { alive, save } from '../../db/repo'
import { db, DEFAULT_SETTINGS, SETTINGS_ID } from '../../db/schema'
import type { DailyInsight, InsightSection } from '../../db/types'
import { dayKey, shiftDay, type DayKey } from '../../lib/dates'
import { getSyncState, onSyncStateChange } from '../../sync/controller'
import { supabase } from '../../sync/supabase'
import { plannedEvents } from '../garmin/sync'
import { loadSources } from '../insights/useDailyData'
import { buildContext, hasRecentData } from './context'

const AREAS: InsightSection['area'][] = ['sono', 'recuperacao', 'treino', 'alimentacao', 'corpo', 'habitos', 'geral']

type InsightBody = Pick<DailyInsight, 'headline' | 'sections' | 'model'>

/** Checks the function's answer field by field; anything malformed is dropped, not trusted. */
export function parseInsight(value: unknown): InsightBody | undefined {
  const data = value as { headline?: unknown; sections?: unknown; model?: unknown } | null
  if (typeof data?.headline !== 'string' || !data.headline.trim() || !Array.isArray(data.sections)) return undefined
  const sections = data.sections.flatMap((raw): InsightSection[] => {
    const section = raw as Partial<Record<keyof InsightSection, unknown>>
    if (typeof section.title !== 'string' || typeof section.text !== 'string') return []
    const area = AREAS.includes(section.area as InsightSection['area']) ? (section.area as InsightSection['area']) : 'geral'
    const tips = Array.isArray(section.tips) ? section.tips.filter((tip): tip is string => typeof tip === 'string') : []
    return [{ area, title: section.title, text: section.text, tips: tips.slice(0, 3) }]
  })
  if (sections.length === 0) return undefined
  return { headline: data.headline.trim(), sections, model: typeof data.model === 'string' ? data.model : 'claude' }
}

interface GenerateState {
  generating: boolean
  error?: string
}

let state: GenerateState = { generating: false }
const listeners = new Set<() => void>()
const setState = (next: GenerateState) => {
  state = next
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useInsightState = (): GenerateState => useSyncExternalStore(subscribe, () => state)

/** The summary of the data the analysis reads, built on the device from the local data. */
export async function contextFor(day: DayKey = dayKey(), withPrevious = true): Promise<string> {
  const [sources, settings, planned, previous] = await Promise.all([
    loadSources(),
    db.settings.get(SETTINGS_ID),
    plannedEvents(),
    db.insights.get(shiftDay(day, -1)),
  ])
  return buildContext({
    sources,
    settings: settings ?? { id: SETTINGS_ID, ...DEFAULT_SETTINGS, updatedAt: 0, deleted: 0, dirty: 0 },
    planned,
    previous: withPrevious && previous && !previous.deleted ? previous : undefined,
    today: day,
    now: new Date(),
  })
}

/** Builds today's summary on the device and asks Claude (daily-insights function) to read it. */
export async function generateInsight(day: DayKey = dayKey()): Promise<void> {
  if (state.generating) return
  if (!supabase) throw new Error('Configure a sincronização para usar a análise do dia.')
  setState({ generating: true })
  try {
    const context = await contextFor(day)
    const { data, error } = await supabase.functions.invoke('daily-insights', { body: { context } })
    if (error instanceof FunctionsHttpError) {
      const answer = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(answer?.error ?? 'A análise falhou.')
    }
    if (error) throw new Error('Não foi possível falar com o servidor. Confira a internet.')
    const insight = parseInsight(data)
    if (!insight) throw new Error('A resposta da análise veio incompleta.')
    await save(db.insights, { id: day, createdAt: Date.now(), ...insight })
    setState({ generating: false })
  } catch (cause) {
    setState({ generating: false, error: cause instanceof Error ? cause.message : String(cause) })
  }
}

// One automatic try per day on each device, success or not: a failure never turns into a loop of paid calls.
const ATTEMPT_KEY = 'insightAttempt'

async function maybeGenerate() {
  const today = dayKey()
  const settings = await db.settings.get(SETTINGS_ID)
  if (settings?.insightsAuto === false) return
  const existing = await db.insights.get(today)
  if (existing && !existing.deleted) return
  if ((await db.meta.get(ATTEMPT_KEY))?.value === today) return
  if (!hasRecentData(await loadSources(), today)) return
  await db.meta.put({ key: ATTEMPT_KEY, value: today })
  await generateInsight(today)
}

/**
 * Once a day, a little after the first sync: the other device's analysis has arrived by then (so it
 * isn't made twice) and the morning's Garmin and Health Connect imports have had time to land.
 */
export function startDailyInsights(): void {
  if (!supabase) return
  let timer: ReturnType<typeof setTimeout> | undefined
  const check = () => {
    const { phase, lastSyncAt, email } = getSyncState()
    if (!email || phase !== 'idle' || !lastSyncAt) return
    clearTimeout(timer)
    timer = setTimeout(() => void maybeGenerate().catch(() => {}), 20_000)
  }
  onSyncStateChange(check)
  check()
}

export const useInsight = (day: DayKey) =>
  useLiveQuery(async () => {
    const insight = await db.insights.get(day)
    return insight && !insight.deleted ? insight : null
  }, [day])

/** Past analyses, newest first. */
export const useInsightHistory = () =>
  useLiveQuery(async () => alive(await db.insights.toArray()).sort((a, b) => b.id.localeCompare(a.id)))
