import { CalendarDays, GlassWater, ListChecks } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router'
import { Card, SkeletonLines } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import type { HomeCardId } from '../../db/types'
import { formatTime, type DayKey } from '../../lib/dates'
import { TodayInsightCard } from '../analysis/TodayInsightCard'
import { eventTitle } from '../calendar/agenda'
import { WeekCard } from '../calendar/cards'
import { TodaySleepCard } from '../garmin/TodaySleepCard'
import { usePlannedEvents } from '../garmin/sync'
import { TodayPlannedCard } from '../garmin/UpcomingWorkouts'
import { HabitCheckList } from '../habits/HabitCheckList'
import { TodayJournalCard } from '../journal/TodayJournalCard'
import { PaceBig, PaceSmall, RecordsBig, RecordsSmall, RunVolumeBig, RunVolumeSmall, StreakBig, StreakSmall } from '../running/RunningCards'
import { TodayWorkoutCard } from '../training/TodayWorkoutCard'
import { sumMl, useWaterLogs } from '../water/water'
import { WaterQuickAdd, WaterSummary } from '../water/WaterQuickAdd'
import { BatteryBig, BurnBig, FoodBig, HrvBig, RaceBig, RestingHrBig, StepsBig, WeightBig } from './bigCards'
import {
  AgendaSmall,
  FoodSmall,
  HabitsSmall,
  InsightSmall,
  JournalSmall,
  LastWeekSmall,
  SleepSmall,
  WaterSmall,
  WorkoutSmall,
} from './smallCards'
import { BatterySmall, BurnSmall, HrvSmall, Note, RaceSmall, RestingHrSmall, SmallCard, StepsSmall, WeightSmall } from './tiles'
import { WeeklyCard } from './WeeklyCard'

type ElementView = ComponentType<{ today: DayKey }>

const linkClass = 'text-sm font-medium text-accent-ink'

function WaterCard({ today }: { today: DayKey }) {
  const settings = useSettings()
  const waterLogs = useWaterLogs(today, today)
  return (
    <Card
      icon={GlassWater}
      tone="water"
      title="Água"
      action={
        <Link to="/agua" className={linkClass}>
          Detalhes
        </Link>
      }
    >
      {waterLogs ? <WaterSummary totalMl={sumMl(waterLogs)} goalMl={settings.waterGoalMl} /> : <SkeletonLines lines={2} />}
      <div className="mt-4">
        <WaterQuickAdd />
      </div>
    </Card>
  )
}

function HabitsCard({ today }: { today: DayKey }) {
  return (
    <Card
      icon={ListChecks}
      tone="habits"
      title="Hábitos"
      action={
        <Link to="/habitos" className={linkClass}>
          Histórico
        </Link>
      }
    >
      <HabitCheckList date={today} />
    </Card>
  )
}

/** Today's workout in the Garmin calendar, in short. */
function PlannedSmall({ today }: { today: DayKey }) {
  const events = usePlannedEvents()
  const todays = events?.filter((event) => event.date === today) ?? []
  if (todays.length === 0) return null
  const [first] = todays
  return (
    <SmallCard icon={CalendarDays} tone="training" label="Treino do Garmin" to={`/calendario?dia=${today}`}>
      <span className="line-clamp-2 text-sm leading-snug font-semibold">{eventTitle(first.title)}</span>
      <Note>
        hoje{first.time !== undefined && ` às ${formatTime(first.time)}`}
        {todays.length > 1 && ` · +${todays.length - 1}`}
      </Note>
    </SmallCard>
  )
}

/** The big card ("Em foco") and the small one ("Visualização rápida") of each element. */
export const ELEMENT_VIEWS: Record<HomeCardId, { big: ElementView; small: ElementView } | undefined> = {
  agenda: { big: WeekCard, small: AgendaSmall },
  workout: { big: TodayWorkoutCard, small: WorkoutSmall },
  planned: { big: TodayPlannedCard, small: PlannedSmall },
  sleep: { big: TodaySleepCard, small: SleepSmall },
  food: { big: FoodBig, small: FoodSmall },
  water: { big: WaterCard, small: WaterSmall },
  habits: { big: HabitsCard, small: HabitsSmall },
  journal: { big: TodayJournalCard, small: JournalSmall },
  insights: { big: TodayInsightCard, small: InsightSmall },
  week: { big: WeeklyCard, small: LastWeekSmall },
  runVolume: { big: RunVolumeBig, small: RunVolumeSmall },
  pace: { big: PaceBig, small: PaceSmall },
  records: { big: RecordsBig, small: RecordsSmall },
  streak: { big: StreakBig, small: StreakSmall },
  race: { big: RaceBig, small: RaceSmall },
  body: { big: WeightBig, small: WeightSmall },
  restingHr: { big: RestingHrBig, small: RestingHrSmall },
  hrv: { big: HrvBig, small: HrvSmall },
  battery: { big: BatteryBig, small: BatterySmall },
  steps: { big: StepsBig, small: StepsSmall },
  burn: { big: BurnBig, small: BurnSmall },
  // The containers of the older layout, no longer elements.
  focus: undefined,
  quick: undefined,
}
