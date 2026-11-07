import { useLiveQuery } from 'dexie-react-hooks'
import {
  CalendarCheck,
  ChevronRight,
  GlassWater,
  ListChecks,
  MessageSquareText,
  NotebookPen,
  Play,
  Scale,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { IconTile, type Tone } from '../../components/tone'
import { Button, Pending } from '../../components/ui'
import { useNow, useSettings } from '../../db/hooks'
import { alive } from '../../db/repo'
import { db } from '../../db/schema'
import { parseDay, shiftDay, type DayKey } from '../../lib/dates'
import { activityLabel } from '../activities/activities'
import { useWeights } from '../body/body'
import { KIND_ICONS, KIND_TONES } from '../calendar/components'
import { useAgenda, useTodayTemplate } from '../calendar/plans'
import { pendingGoals, pendingProposal } from '../food/checkIn'
import { useFoodLogs } from '../food/nutrition'
import { useCheckIn } from '../food/useCheckIn'
import { dayGoals } from '../habits/day'
import { useHabitLogs, useHabits } from '../habits/habits'
import { useJournalEntry } from '../journal/journal'
import { isRun } from '../running/running'
import { useStartWorkout } from '../training/components'
import { findActive, useSessions, useTemplates } from '../training/training'
import { sumMl, useContainers, useWaterLogs } from '../water/water'
import { useAddWater } from '../water/WaterQuickAdd'
import { nextStep, type NowStep } from './now'

const LOOKS: Record<Exclude<NowStep['kind'], 'workout' | 'upcoming'>, { icon: LucideIcon; tone: Tone }> = {
  weighIn: { icon: Scale, tone: 'body' },
  meal: { icon: Utensils, tone: 'food' },
  water: { icon: GlassWater, tone: 'water' },
  habits: { icon: ListChecks, tone: 'habits' },
  journal: { icon: NotebookPen, tone: 'journal' },
  comment: { icon: MessageSquareText, tone: 'today' },
  checkIn: { icon: CalendarCheck, tone: 'food' },
}

const look = (step: NowStep) =>
  step.kind === 'workout' || step.kind === 'upcoming'
    ? { icon: KIND_ICONS[step.agendaKind ?? 'gym'], tone: KIND_TONES[step.agendaKind ?? 'gym'] }
    : LOOKS[step.kind]

const actionClass =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-medium text-white transition hover:brightness-110 active:scale-[0.97]'

/**
 * "Agora", at the top of the Hoje screen: the one thing worth doing now (the workout about to start,
 * the weigh-in, the meal, the water, the habits), with a button that does it. Hidden when nothing is pending.
 */
export function NowCard({ today }: { today: DayKey }) {
  const now = useNow()
  const settings = useSettings()
  const sessions = useSessions()
  const agenda = useAgenda(today, shiftDay(today, 6), today)
  const todays = useTodayTemplate(today)
  const templates = useTemplates()
  const weights = useWeights()
  const foodLogs = useFoodLogs(shiftDay(today, -7), today)
  const waterLogs = useWaterLogs(today, today)
  const containers = useContainers()
  const habits = useHabits()
  const habitLogs = useHabitLogs(today, today)
  const journal = useJournalEntry(today)
  const todaysActivities = useLiveQuery(
    async () => alive(await db.activities.where('startTime').aboveOrEqual(parseDay(today).getTime()).toArray()),
    [today],
  )
  // Read only on Sunday and Monday, the days "Agora" brings the week's check-in up.
  const checkIn = useCheckIn('week', now.getDay() <= 1)
  const start = useStartWorkout()
  const addWater = useAddWater()

  // Nothing shows while loading, but the screen waits for it: the card would push everything down.
  if (
    !sessions ||
    !agenda ||
    todays === undefined ||
    !weights ||
    !foodLogs ||
    !waterLogs ||
    !containers ||
    !habits ||
    !habitLogs ||
    journal === undefined ||
    !todaysActivities ||
    (now.getDay() <= 1 && checkIn === undefined)
  ) {
    return <Pending />
  }

  const lastWeek = shiftDay(today, -7)
  const glass = containers?.find((container) => container.favorite === 1)
  // Today's log of each habit: a skipped one isn't asked for.
  const habitDay = new Map(habitLogs.filter((log) => log.date === today).map((log) => [log.habitId, log]))
  const active = findActive(sessions)
  // The latest run of the day that has no comment or effort yet.
  const run = todaysActivities
    .filter((activity) => isRun(activity) && activity.date === today && !activity.notes?.trim() && !activity.effort)
    .sort((a, b) => b.startTime - a.startTime)[0]
  const step = nextStep(
    {
      today,
      active: active && { id: active.id, name: active.name },
      agenda,
      gymTemplateId: todays?.template.id,
      weighed: weights.some((weight) => weight.date === today),
      weighsIn: weights.some((weight) => weight.date >= lastWeek && weight.date < today),
      meals: new Set(foodLogs.filter((log) => log.date === today).map((log) => log.meal)),
      usualMeals: new Set(foodLogs.filter((log) => log.date < today).map((log) => log.meal)),
      waterMl: sumMl(waterLogs),
      waterGoalMl: settings.waterGoalMl,
      glassMl: glass?.ml ?? 250,
      habitsLeft: dayGoals(
        habits.filter((habit) => habit.archived === 0 && habit.startDate <= today),
        habitDay,
      ).left.map((habit) => habit.name),
      journaled: journal !== null,
      uncommented: run && { id: run.id, title: run.title ?? activityLabel(run), endedAt: run.startTime + run.elapsedSec * 1000 },
      smart: settings.smartReminders,
      checkIn: checkIn && pendingGoals(pendingProposal(checkIn.checkIn, checkIn.decision)),
    },
    now,
  )
  if (!step) return null

  const { icon, tone } = look(step)
  const action = step.action
  return (
    <section aria-label={step.when} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <IconTile icon={icon} tone={tone} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{step.when}</p>
        <p className="line-clamp-2 text-sm font-semibold">{step.title}</p>
        {step.detail && <p className="line-clamp-2 text-xs text-ink-2">{step.detail}</p>}
      </div>
      {action?.type === 'link' && (
        <Link to={action.to} className={actionClass}>
          {action.label}
          <ChevronRight size={14} className="-mr-1" />
        </Link>
      )}
      {action?.type === 'start' && (
        <Button size="sm" variant="primary" onClick={() => void start(templates?.find((t) => t.id === action.templateId))}>
          <Play size={14} /> {action.label}
        </Button>
      )}
      {action?.type === 'water' && (
        <Button size="sm" variant="primary" onClick={() => void addWater(action.ml, glass)}>
          <GlassWater size={14} /> {action.label}
        </Button>
      )}
    </section>
  )
}
