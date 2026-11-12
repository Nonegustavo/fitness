import { liveQuery } from 'dexie'
import { useEffect, useEffectEvent, useRef } from 'react'
import { celebrate, celebratedWithin } from '../../components/celebrate'
import { useToast } from '../../components/Toast'
import { useToday } from '../../db/hooks'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import type { ActivityStream } from '../../db/types'
import { dayKey, type DayKey } from '../../lib/dates'
import { isOutdoorRun, personalRecords } from '../running/running'
import { useStreaks } from './StreakCards'
import { milestoneMessage, recordNews, snapshotOf, type RecordSnapshot, type StreakKind } from './streaks'

/** Kept on this device only: the records last seen, and the day each streak was last celebrated. */
const RECORDS_KEY = 'runRecords'
const CELEBRATED_KEY = 'streaksCelebrated'

/**
 * A streak is reached by logging something, which shows its own toast (with "Desfazer"). The two can
 * be on screen together, so this only lets the first one land before the party starts.
 */
const AFTER_ACTION_MS = 1200
const BETWEEN_MS = 4500

/**
 * Throws a small party for new running records (after the watch syncs) and for streak milestones
 * (7 days in a row at the water goal…): confetti, a buzz and a message. Renders nothing.
 */
export function Celebrations() {
  const today = useToday()
  const current = useStreaks(today)
  const toast = useToast()
  const queue = useRef<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showNext = useEffectEvent(() => {
    const message = queue.current.shift()
    if (!message) {
      timer.current = undefined
      return
    }
    // Reaching the water goal already threw confetti a moment ago.
    if (!celebratedWithin(6000)) celebrate()
    toast({ message })
    timer.current = setTimeout(showNext, BETWEEN_MS)
  })

  const announce = useEffectEvent((messages: string[], delay: number) => {
    queue.current.push(...messages)
    if (!timer.current) timer.current = setTimeout(showNext, delay)
  })

  // Streak milestones, once a day each.
  useEffect(() => {
    if (!current) return
    let stale = false
    void (async () => {
      const row = await db.meta.get(CELEBRATED_KEY)
      const celebrated = (row?.value as Partial<Record<StreakKind, DayKey>> | undefined) ?? {}
      const due = (Object.keys(current) as StreakKind[]).flatMap((kind) => {
        const message = celebrated[kind] === today ? undefined : milestoneMessage(kind, current[kind])
        return message ? [{ kind, message }] : []
      })
      if (stale || due.length === 0) return
      await db.meta.put({ key: CELEBRATED_KEY, value: { ...celebrated, ...Object.fromEntries(due.map(({ kind }) => [kind, today])) } })
      announce(
        due.map(({ message }) => message),
        AFTER_ACTION_MS,
      )
    })()
    return () => {
      stale = true
    }
  }, [current, today])

  // Running records, whenever runs (or their samples) arrive. Starts a little after opening, as
  // it reads the samples of every run.
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined
    let subscription: { unsubscribe: () => void } | undefined
    const start = setTimeout(() => {
      subscription = liveQuery(async () => {
        const runs = alive(await db.activities.toArray()).filter(isOutdoorRun)
        const streams = await db.activityStreams.bulkGet(runs.map((run) => run.id))
        return personalRecords(
          runs,
          new Map(streams.filter((stream): stream is ActivityStream => stream !== undefined).map((stream) => [stream.id, stream])),
        )
      }).subscribe({
        next: (records) => {
          clearTimeout(debounce)
          debounce = setTimeout(() => {
            void (async () => {
              const previous = (await db.meta.get(RECORDS_KEY))?.value as RecordSnapshot | undefined
              const snapshot = snapshotOf(records)
              // The first look (or one with no records yet, before the history arrives) only takes note.
              const news = previous && Object.keys(previous.best).length > 0 ? recordNews(previous, records, dayKey()) : []
              if (JSON.stringify(previous) !== JSON.stringify(snapshot)) await db.meta.put({ key: RECORDS_KEY, value: snapshot })
              if (news.length > 0) announce(news, 800)
            })()
          }, 1500)
        },
      })
    }, 4000)
    return () => {
      clearTimeout(start)
      clearTimeout(debounce)
      subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])
  return null
}
