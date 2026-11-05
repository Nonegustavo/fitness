import { Beef, Flame, GlassWater, ListChecks, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { IconTile, toneColor, type Tone } from '../../components/tone'
import { Card, SkeletonCard } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import { shiftDay, type DayKey } from '../../lib/dates'
import { goalsFor, useFoodLogs, useTrainingDays } from '../food/nutrition'
import { useHabitLogs, useHabits } from '../habits/habits'
import { Note, SmallCard, TileSkeleton, Value } from '../today/tiles'
import { useWaterLogs } from '../water/water'
import { MILESTONES, STREAK_DAYS, STREAK_LABELS, streaks, type Streak, type StreakKind } from './streaks'

const KINDS: { kind: StreakKind; icon: LucideIcon; tone: Tone; to: string }[] = [
  { kind: 'water', icon: GlassWater, tone: 'water', to: '/agua' },
  { kind: 'protein', icon: Beef, tone: 'food', to: '/alimentacao' },
  { kind: 'habits', icon: ListChecks, tone: 'habits', to: '/habitos' },
]

/** The streaks as of today; undefined while loading. */
export function useStreaks(today: DayKey): Partial<Record<StreakKind, Streak>> | undefined {
  const settings = useSettings()
  const from = shiftDay(today, -STREAK_DAYS)
  const water = useWaterLogs(from, today)
  const foodLogs = useFoodLogs(from, today)
  const trainingDays = useTrainingDays(from, today)
  const habits = useHabits()
  const habitLogs = useHabitLogs(from, today)
  return useMemo(() => {
    if (!water || !foodLogs || !trainingDays || !habits || !habitLogs) return undefined
    return streaks(
      {
        water,
        waterGoalMl: settings.waterGoalMl,
        foodLogs,
        goalOn: (date) => goalsFor(settings, trainingDays.has(date)),
        habits,
        habitLogs,
      },
      today,
    )
  }, [water, foodLogs, trainingDays, habits, habitLogs, settings, today])
}

const days = (count: number) => (count === 1 ? 'dia' : 'dias')

/** What to say under a streak: how far to the next mark, or that today still counts. */
function hint(streak: Streak): string {
  if (streak.skippedToday) return streak.count > 0 ? 'Hoje pulado · a sequência continua' : 'Hoje pulado'
  if (!streak.today) return streak.count > 0 ? 'Bata a meta hoje para continuar' : 'Comece hoje'
  const next = MILESTONES.find((mark) => mark > streak.count)
  return next ? `Hoje já conta · próxima marca: ${next} dias` : 'Hoje já conta'
}

/** "Em foco": every streak, with the days in a row and the next mark. */
export function StreaksBig({ today }: { today: DayKey }) {
  const current = useStreaks(today)
  if (!current) return <SkeletonCard lines={3} />
  const shown = KINDS.filter(({ kind }) => current[kind])
  if (shown.length === 0) return null
  return (
    <Card icon={Flame} tone="habits" title="Sequências">
      <ul className="space-y-2">
        {shown.map(({ kind, icon, tone }) => {
          const streak = current[kind]!
          return (
            <li key={kind} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
              <IconTile icon={icon} tone={tone} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{STREAK_LABELS[kind]}</span>
                <span className="block truncate text-xs text-muted">{hint(streak)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Flame
                  size={16}
                  aria-hidden
                  style={{ color: streak.count > 0 ? toneColor(streak.today ? 'training' : 'habits') : 'var(--muted)' }}
                />
                <span className="text-lg font-semibold tabular-nums">{streak.count}</span>
                <span className="text-xs text-muted">{days(streak.count)}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** "Visualização rápida": the longest streak going. */
export function StreaksSmall({ today }: { today: DayKey }) {
  const current = useStreaks(today)
  if (!current) return <TileSkeleton />
  const best = KINDS.filter(({ kind }) => current[kind]).sort((a, b) => current[b.kind]!.count - current[a.kind]!.count)[0]
  if (!best) return null
  const streak = current[best.kind]!
  return (
    <SmallCard icon={Flame} tone="habits" label="Sequências" to={best.to}>
      <Value value={streak.count} unit={`${days(streak.count)} seguidos`} />
      <Note>{STREAK_LABELS[best.kind]}</Note>
      <Note>{streak.today ? 'Hoje já conta' : streak.skippedToday ? 'Hoje pulado' : 'Falta hoje'}</Note>
    </SmallCard>
  )
}
