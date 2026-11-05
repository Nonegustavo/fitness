import { useLiveQuery } from 'dexie-react-hooks'
import { useToday } from '../../db/hooks'
import { alive, patch } from '../../db/repo'
import { db, DEFAULT_SETTINGS, SETTINGS_ID } from '../../db/schema'
import type { GoalCheckIn, Settings } from '../../db/types'
import { shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { checkInFrom, decisionFor, pendingGoals, pendingProposal, type CheckIn, type PendingGoals } from './checkIn'
import { ESTIMATE_DAYS } from './energy'

export interface CheckInState {
  checkIn: CheckIn
  /** The answer already given to this week's check-in. */
  decision?: GoalCheckIn
  settings: Settings
}

/** The check-in made on a day, from the 4 weeks of food logs, weigh-ins and workouts before it. */
export async function loadCheckIn(asOf: DayKey): Promise<CheckInState> {
  const from = shiftDay(asOf, -ESTIMATE_DAYS)
  const to = shiftDay(asOf, -1)
  const [stored, foodLogs, weights, sessions] = await Promise.all([
    db.settings.get(SETTINGS_ID),
    db.foodLogs.where('date').between(from, to, true, true).toArray(),
    db.weights.where('date').belowOrEqual(to).toArray(),
    db.workoutSessions.where('date').between(from, to, true, true).toArray(),
  ])
  const settings = stored ?? { id: SETTINGS_ID, ...DEFAULT_SETTINGS, updatedAt: 0, deleted: 0, dirty: 0 }
  const checkIn = checkInFrom({ foodLogs: alive(foodLogs), weights: alive(weights), sessions: alive(sessions) }, settings, asOf)
  return { checkIn, decision: decisionFor(checkIn, settings.goalCheckIn), settings }
}

/**
 * This week's check-in, made from its Sunday so it holds all week ('week'), or one made today
 * ('today', "Revisar metas agora"). Undefined while loading, or when not `enabled`.
 */
export function useCheckIn(when: 'week' | 'today', enabled = true): CheckInState | undefined {
  const today = useToday()
  const asOf = when === 'week' ? weekStart(today) : today
  return useLiveQuery(async () => (enabled ? loadCheckIn(asOf) : undefined), [asOf, enabled])
}

/** The new targets of the week, if a proposal is still waiting for the user (the Sunday summary mentions it). */
export async function weekGoalsPending(asOf: DayKey): Promise<PendingGoals | undefined> {
  const { checkIn, settings } = await loadCheckIn(asOf)
  return pendingGoals(pendingProposal(checkIn, settings.goalCheckIn))
}

/** Takes the proposed targets, and records the week's check-in as accepted. */
export async function acceptCheckIn({ checkIn, decision }: CheckInState): Promise<void> {
  if (checkIn.kind !== 'ready') return
  const { current, proposed, expenditure } = checkIn.proposal
  // A second look in the same week keeps the targets the week began with.
  const before = decision?.status === 'accepted' && decision.before ? decision.before : current.normal
  await patch(db.settings, SETTINGS_ID, {
    nutrition: { normal: proposed.normal, training: proposed.training },
    goalCheckIn: { week: checkIn.week, status: 'accepted', before, proposed: proposed.normal, expenditure: Math.round(expenditure.kcal) },
  })
}

/** "Agora não": the targets stay, and the check-in waits for next week. An accepted week stays accepted. */
export async function dismissCheckIn({ checkIn, decision }: CheckInState): Promise<void> {
  if (decision?.status === 'accepted') return
  const proposal = checkIn.kind === 'ready' ? checkIn.proposal : undefined
  await patch(db.settings, SETTINGS_ID, {
    goalCheckIn: {
      week: checkIn.week,
      status: 'dismissed',
      ...(proposal && {
        before: proposal.current.normal,
        proposed: proposal.proposed.normal,
        expenditure: Math.round(proposal.expenditure.kcal),
      }),
    },
  })
}
