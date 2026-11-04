import { GlassWater, House, ListChecks, Scale, Settings, SlidersHorizontal } from 'lucide-react'
import { WeeklyCard } from './WeeklyCard'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button, Card, IconButton, Page, Stat } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import type { HomeCardId } from '../../db/types'
import { formatDay, relativeDay, type DayKey } from '../../lib/dates'
import { formatFixed, formatSigned } from '../../lib/format'
import { changeOver } from '../../lib/stats'
import { TodayInsightCard } from '../analysis/TodayInsightCard'
import { metricSeries, useWeights } from '../body/body'
import { WeightModal } from '../body/WeightModal'
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

const linkClass = 'text-sm font-medium text-accent-ink'

export default function TodayPage() {
  const today = useToday()
  const settings = useSettings()
  const [customizing, setCustomizing] = useState(false)
  const cards = homeLayout(settings.home).filter((card) => card.visible)

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
      {cards.map(({ id }) => (
        <HomeCard key={id} id={id} today={today} />
      ))}

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
    case 'sleep':
      return <TodaySleepCard today={today} />
    case 'planned':
      return <TodayPlannedCard today={today} />
    case 'workout':
      return <TodayWorkoutCard today={today} />
    case 'food':
      return <TodayFoodCard today={today} />
    case 'body':
      return <BodyCard today={today} />
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
  }
}

function BodyCard({ today }: { today: DayKey }) {
  const weights = useWeights()
  const [weightOpen, setWeightOpen] = useState(false)
  const weight = useMemo(() => metricSeries(weights ?? [], (entry) => entry.weightKg), [weights])
  const latest = weights?.at(-1)
  const trendNow = weight.trend.at(-1)
  const change7 = changeOver(weight.trend, 7)
  const weighedToday = weights?.some((entry) => entry.date === today) ?? false

  return (
    <Card
      icon={Scale}
      tone="body"
      title="Corpo"
      action={
        <Link to="/corpo" className={linkClass}>
          Gráficos
        </Link>
      }
    >
      {latest ? (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Último peso" value={`${formatFixed(latest.weightKg)} kg`} note={relativeDay(latest.date, today)} />
          <Stat label="Tendência" value={trendNow ? `${formatFixed(trendNow.value)} kg` : '—'} />
          <Stat label="Em 7 dias" value={change7 === undefined ? '—' : `${formatSigned(change7)} kg`} />
        </div>
      ) : (
        <p className="text-sm text-muted">Nenhuma pesagem ainda.</p>
      )}
      {weights && !weighedToday && (
        <Button variant="primary" className="mt-3 w-full" onClick={() => setWeightOpen(true)}>
          <Scale size={18} /> Registrar peso de hoje
        </Button>
      )}
      {weightOpen && <WeightModal entry={null} onClose={() => setWeightOpen(false)} />}
    </Card>
  )
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
      <WaterSummary totalMl={sumMl(waterLogs ?? [])} goalMl={settings.waterGoalMl} />
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
