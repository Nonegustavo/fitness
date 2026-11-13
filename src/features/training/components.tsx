import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '../../components/Toast'
import type { WorkoutTemplate } from '../../db/types'
import { formatClock, parseClock } from '../../lib/format'
import { findActive, startWorkout, useSessions } from './training'
import { startFeedback } from '../../lib/haptics'

/** Live "12:34" since a timestamp. */
export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return <span className="tabular-nums">{formatClock((now - since) / 1000)}</span>
}

/**
 * How a time typed in a field was read ("= 1:30"), so "130" showing as 2:10 is no surprise, or a nudge
 * in red when it can't be read. Nothing while the field is empty. `parse` reads it (seconds by default).
 */
export function clockHint(text: string, parse: (text: string) => number | undefined = parseClock): ReactNode {
  if (!text.trim()) return undefined
  const seconds = parse(text)
  if (seconds === undefined) return <span className="text-critical">use min:seg</span>
  return `= ${formatClock(seconds)}`
}

/** The same, only when the text isn't already written as it reads ("130", not "2:10"): for tight rows. */
export function clockHintIfDifferent(text: string): ReactNode {
  const seconds = parseClock(text)
  return seconds !== undefined && formatClock(seconds) === text.trim() ? undefined : clockHint(text)
}

/** Starts a workout and opens it; with one already running, opens that one instead. */
export function useStartWorkout(): (template?: WorkoutTemplate) => Promise<void> {
  const navigate = useNavigate()
  const toast = useToast()
  const sessions = useSessions()
  return async (template) => {
    const active = findActive(sessions)
    if (active) {
      toast({ message: 'Já existe um treino em andamento.' })
      navigate(`/treinos/sessao/${active.id}`)
      return
    }
    startFeedback()
    navigate(`/treinos/sessao/${await startWorkout(template)}`)
  }
}
