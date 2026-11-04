import { GlassWater, House, ListChecks, Settings, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Carousel } from '../../components/Carousel'
import { Card, IconButton, Page, SkeletonLines } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import type { HomeCardId } from '../../db/types'
import { formatDay, type DayKey } from '../../lib/dates'
import { TodayInsightCard } from '../analysis/TodayInsightCard'
import { WeekCard } from '../calendar/cards'
import { HabitCheckList } from '../habits/HabitCheckList'
import { TodayFoodCard } from '../food/TodayFoodCard'
import { TodaySleepCard } from '../garmin/TodaySleepCard'
import { TodayPlannedCard } from '../garmin/UpcomingWorkouts'
import { TodayJournalCard } from '../journal/TodayJournalCard'
import { TodayWorkoutCard } from '../training/TodayWorkoutCard'
import { sumMl, useWaterLogs } from '../water/water'
import { WaterQuickAdd, WaterSummary } from '../water/WaterQuickAdd'
import { CustomizeHome } from './CustomizeHome'
import { homeLayout } from './homeCards'
import {
  BatteryTile,
  BurnTile,
  HrvTile,
  QuickGrid,
  RaceTile,
  RestingHrTile,
  StepsTile,
  WeightTile,
} from './QuickTiles'
import { WeeklyCard } from './WeeklyCard'

const linkClass = 'text-sm font-medium text-accent-ink'

export default function TodayPage() {
  const today = useToday()
  const settings = useSettings()
  const [customizing, setCustomizing] = useState(false)
  const cards = homeLayout(settings.home).filter((card) => card.visible)
  const focus = cards.filter((card) => card.zone === 'focus')
  const quick = cards.filter((card) => card.zone === 'quick')

  return (
    <Page
      title="Hoje"
      icon={House}
      tone="today"
      subtitle={formatDay(today)}
      actions={
        <>
          <IconButton label="Personalizar o Hoje" onClick={() => setCustomizing(true)}>
            <SlidersHorizontal size={20} />
          </IconButton>
          <Link
            to="/ajustes"
            aria-label="Ajustes"
            title="Ajustes"
            className="inline-flex size-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2 lg:hidden"
          >
            <Settings size={20} />
          </Link>
        </>
      }
    >
      {cards
        .filter((card) => card.zone === 'main')
        .map(({ id }) => {
          if (id === 'focus') {
            return (
              focus.length > 0 && (
                <div key={id}>
                  <h2 className="mb-2 text-base font-semibold">Em foco</h2>
                  <Carousel label="Em foco">
                    {focus.map((card) => (
                      <HomeCard key={card.id} id={card.id} today={today} />
                    ))}
                  </Carousel>
                </div>
              )
            )
          }
          if (id === 'quick') {
            return (
              quick.length > 0 && (
                <QuickGrid key={id}>
                  {quick.map((card) => (
                    <HomeCard key={card.id} id={card.id} today={today} />
                  ))}
                </QuickGrid>
              )
            )
          }
          return <HomeCard key={id} id={id} today={today} />
        })}

      <button
        type="button"
        onClick={() => setCustomizing(true)}
        className="mx-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted hover:text-ink"
      >
        <SlidersHorizontal size={14} /> Escolher o que aparece aqui
      </button>

      {customizing && <CustomizeHome onClose={() => setCustomizing(false)} />}
    </Page>
  )
}

function HomeCard({ id, today }: { id: HomeCardId; today: DayKey }) {
  switch (id) {
    case 'agenda':
      return <WeekCard today={today} />
    case 'sleep':
      return <TodaySleepCard today={today} />
    case 'planned':
      return <TodayPlannedCard today={today} />
    case 'workout':
      return <TodayWorkoutCard today={today} />
    case 'food':
      return <TodayFoodCard today={today} />
    case 'water':
      return <WaterCard today={today} />
    case 'habits':
      return <HabitsCard today={today} />
    case 'journal':
      return <TodayJournalCard today={today} />
    case 'insights':
      return <TodayInsightCard today={today} />
    case 'week':
      return <WeeklyCard today={today} />
    case 'body':
      return <WeightTile today={today} />
    case 'race':
      return <RaceTile today={today} />
    case 'restingHr':
      return <RestingHrTile today={today} />
    case 'hrv':
      return <HrvTile today={today} />
    case 'battery':
      return <BatteryTile today={today} />
    case 'steps':
      return <StepsTile today={today} />
    case 'burn':
      return <BurnTile today={today} />
    // The carousel and the grid are drawn by the page around their cards.
    case 'focus':
    case 'quick':
      return null
  }
}

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
