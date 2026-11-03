import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '../../components/Toast'
import type { WorkoutTemplate } from '../../db/types'
import { formatClock } from '../../lib/format'
import { findActive, startWorkout, useSessions } from './training'

/** Live "12:34" since a timestamp. */
export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return <span className="tabular-nums">{formatClock((now - since) / 1000)}</span>
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
    navigate(`/treinos/sessao/${await startWorkout(template)}`)
  }
}
