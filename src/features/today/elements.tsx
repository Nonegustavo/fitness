import { GlassWater, ListChecks } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router'
import { Card, SkeletonLines } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import type { HomeCardId } from '../../db/types'
import type { DayKey } from '../../lib/dates'
import { TodayInsightCard } from '../analysis/TodayInsightCard'
import { TodaySleepCard } from '../garmin/TodaySleepCard'
import { HabitCheckList } from '../habits/HabitCheckList'
import { TodayJournalCard } from '../journal/TodayJournalCard'
import { PaceBig, PaceSmall, RecordsBig, RecordsSmall, RunVolumeBig, RunVolumeSmall, StreakBig, StreakSmall } from '../running/RunningCards'
import { TodayWorkoutsCard } from '../calendar/cards'
import { sumMl, useWaterLogs } from '../water/water'
import { WaterQuickAdd, WaterSummary } from '../water/WaterQuickAdd'
import { BatteryBig, BurnBig, FoodBig, HrvBig, RaceBig, RestingHrBig, StepsBig, WeightBig } from './bigCards'
import {
  FoodSmall,
  HabitsSmall,
  InsightSmall,
  JournalSmall,
  LastWeekSmall,
  SleepSmall,
  WaterSmall,
  WorkoutSmall,
} from './smallCards'
import { BatterySmall, BurnSmall, HrvSmall, RaceSmall, RestingHrSmall, StepsSmall, WeightSmall } from './tiles'
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
        <WaterQuickAdd simple />
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
      <HabitCheckList date={today} compact />
    </Card>
  )
}

/** The big card ("Em foco") and the small one ("Visualização rápida") of each element. */
export const ELEMENT_VIEWS: Record<HomeCardId, { big: ElementView; small: ElementView } | undefined> = {
  // "Minha semana" sits above "Em foco" instead.
  agenda: undefined,
  workout: { big: TodayWorkoutsCard, small: WorkoutSmall },
  // Today's Garmin workouts are in "Treinos de hoje" now.
  planned: undefined,
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
