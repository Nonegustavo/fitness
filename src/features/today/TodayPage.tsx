import { Scale, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button, Card, Page, Stat } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import { formatDay, relativeDay } from '../../lib/dates'
import { formatFixed, formatSigned } from '../../lib/format'
import { changeOver } from '../../lib/stats'
import { metricSeries, useWeights } from '../body/body'
import { WeightModal } from '../body/WeightModal'
import { HabitCheckList } from '../habits/HabitCheckList'
import { TodayWorkoutCard } from '../training/TodayWorkoutCard'
import { sumMl, useWaterLogs } from '../water/water'
import { WaterQuickAdd, WaterSummary } from '../water/WaterQuickAdd'

const linkClass = 'text-sm font-medium text-accent-ink'

export default function TodayPage() {
  const today = useToday()
  const settings = useSettings()
  const waterLogs = useWaterLogs(today, today)
  const weights = useWeights()
  const [weightOpen, setWeightOpen] = useState(false)

  const weight = useMemo(() => metricSeries(weights ?? [], (entry) => entry.weightKg), [weights])
  const latest = weights?.at(-1)
  const trendNow = weight.trend.at(-1)
  const change7 = changeOver(weight.trend, 7)
  const weighedToday = weights?.some((entry) => entry.date === today) ?? false

  return (
    <Page
      title="Hoje"
      subtitle={formatDay(today)}
      actions={
        <Link
          to="/ajustes"
          aria-label="Ajustes"
          title="Ajustes"
          className="inline-flex size-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2 lg:hidden"
        >
          <Settings size={20} />
        </Link>
      }
    >
      <TodayWorkoutCard today={today} />

      <Card
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
      </Card>

      <Card
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

      <Card
        title="Hábitos"
        action={
          <Link to="/habitos" className={linkClass}>
            Histórico
          </Link>
        }
      >
        <HabitCheckList date={today} />
      </Card>

      {weightOpen && <WeightModal entry={null} onClose={() => setWeightOpen(false)} />}
    </Page>
  )
}
