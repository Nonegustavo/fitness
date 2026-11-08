import { ChevronRight, Dumbbell, RefreshCw, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Confirm } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, Card, cx, Empty, Page, Stat } from '../../components/ui'
import type { Activity } from '../../db/types'
import { formatDay, formatTime } from '../../lib/dates'
import { formatClock, formatFixed } from '../../lib/format'
import { PlannedWorkoutCard } from '../garmin/PlannedWorkoutCard'
import { refreshFromGarmin, type GarminRefresh } from '../garmin/sync'
import { GearPicker } from '../gear/GearPicker'
import { useSessions } from '../training/training'
import {
  activityLabel,
  deleteActivity,
  deviceName,
  formatDistance,
  formatSpeed,
  matchSession,
  speedKind,
  useActivity,
  useActivityStream,
} from './activities'
import { ActivityFeedback } from './ActivityFeedback'
import { HeartRateZones, LapsTable, StreamCharts } from './ActivityCharts'
import { ActivityMap } from './ActivityMap'
import { checkWorkout } from './compliance'
import { ShareActivityButton } from './ShareButtons'
import { WeatherLine } from './WeatherView'
import { WorkoutCheckCard } from './WorkoutCheckCard'

export default function ActivityPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const activity = useActivity(id)
  const stream = useActivityStream(activity ? id : undefined)
  const sessions = useSessions()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const check = useMemo(() => (activity ? checkWorkout(activity) : undefined), [activity])

  const back = { to: '/treinos/atividades', label: 'Atividades' }
  if (activity === undefined) return null
  if (activity === null) {
    return (
      <Page title="Atividade" back={back}>
        <Card>
          <Empty>Atividade não encontrada.</Empty>
        </Card>
      </Page>
    )
  }

  const kind = speedKind(activity)
  const session = sessions ? matchSession(activity, sessions) : undefined
  const moved = (activity.distanceM ?? 0) > 0
  const stats: { label: string; value: ReactNode; note?: ReactNode }[] = [
    {
      label: 'Tempo',
      value: formatClock(activity.timerSec),
      note: activity.elapsedSec - activity.timerSec >= 60 ? `total ${formatClock(activity.elapsedSec)}` : undefined,
    },
  ]
  if (moved) stats.push({ label: 'Distância', value: formatDistance(activity.distanceM!) })
  if (moved && activity.avgSpeed) {
    stats.push({
      label: kind === 'speed' ? 'Velocidade média' : 'Ritmo médio',
      value: formatSpeed(activity.avgSpeed, kind),
      note: kind === 'speed' && activity.maxSpeed ? `máx ${formatSpeed(activity.maxSpeed, kind)}` : undefined,
    })
  }
  if (activity.avgHr !== undefined) {
    stats.push({ label: 'FC média', value: `${activity.avgHr} bpm`, note: activity.maxHr ? `máx ${activity.maxHr} bpm` : undefined })
  }
  if (activity.calories !== undefined) stats.push({ label: 'Calorias', value: `${activity.calories} kcal` })
  if (activity.ascentM) {
    stats.push({ label: 'Subida', value: `${activity.ascentM} m`, note: activity.descentM ? `descida ${activity.descentM} m` : undefined })
  }
  if (activity.avgCadence) {
    stats.push({ label: 'Cadência média', value: activity.avgCadence, note: kind === 'pace' ? 'passos/min' : 'rpm' })
  }
  if (activity.avgPower) {
    stats.push({
      label: 'Potência média',
      value: `${activity.avgPower} W`,
      note: activity.normalizedPower ? `normalizada ${activity.normalizedPower} W` : undefined,
    })
  }
  if (activity.aerobicEffect !== undefined) {
    stats.push({
      label: 'Efeito aeróbico',
      value: formatFixed(activity.aerobicEffect, 1),
      note: activity.anaerobicEffect !== undefined ? `anaeróbico ${formatFixed(activity.anaerobicEffect, 1)}` : undefined,
    })
  }

  const label = activityLabel(activity)
  return (
    <Page
      title={activity.title ?? label}
      subtitle={`${activity.title ? `${label} · ` : ''}${formatDay(activity.date)} · ${formatTime(activity.startTime)}`}
      back={back}
      actions={<ShareActivityButton activity={activity} stream={stream} />}
    >
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <Stat key={stat.label} {...stat} />
          ))}
        </div>
        <WeatherLine activity={activity} />
        {activity.device && <p className="mt-4 text-xs text-muted">Gravado com {deviceName(activity.device)}</p>}
      </Card>

      <GearPicker activity={activity} />

      {/* A gym workout has its own "Como foi o treino?" in the session. */}
      {!session && <ActivityFeedback key={activity.id} activity={activity} focus={params.get('comentar') === '1'} />}

      {session && (
        <Card>
          <Link to={`/treinos/sessao/${session.id}`} className="flex items-center gap-3 hover:text-accent-ink">
            <Dumbbell size={20} className="shrink-0 text-ink-2" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-ink-2">Treino da ficha feito nesta atividade</span>
              <span className="block truncate font-medium">{session.name}</span>
            </span>
            <ChevronRight size={18} className="text-muted" />
          </Link>
        </Card>
      )}

      {activity.workout && (
        // The step-by-step comparison below replaces the hint about the laps.
        <PlannedWorkoutCard workout={activity.workout} foot={kind === 'pace'} lapsBelow={activity.laps.length > 1 && !check} />
      )}
      {check && <WorkoutCheckCard activity={activity} check={check} />}

      {stream?.track && (
        <Card title="Percurso">
          <ActivityMap track={stream.track} />
        </Card>
      )}

      {stream && (
        <Card title="Gráficos">
          <StreamCharts activity={activity} stream={stream} />
        </Card>
      )}

      {activity.hrZones && (
        <Card title="Zonas de frequência cardíaca">
          <HeartRateZones zones={activity.hrZones} />
        </Card>
      )}

      {activity.laps.length > 1 && (
        <Card title="Voltas">
          <LapsTable activity={activity} />
        </Card>
      )}

      {activity.garminId !== undefined && <RefreshFromGarmin activity={activity} />}

      <Button variant="ghost" className="w-full text-critical" onClick={() => setConfirmDelete(true)}>
        <Trash2 size={16} /> Excluir atividade
      </Button>

      {confirmDelete && (
        <Confirm
          title="Excluir atividade?"
          message="Ela sai do app em todos os aparelhos. No Garmin Connect, nada muda."
          confirmLabel="Excluir"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => void deleteActivity(activity.id).then(() => navigate('/treinos/atividades'))}
        />
      )}
    </Page>
  )
}

const REFRESHED: Record<GarminRefresh, string> = {
  updated: 'Atividade atualizada com a edição do Garmin',
  same: 'Nada mudou no Garmin: a atividade já está igual',
  gone: 'O Garmin não tem mais esta atividade',
}

/**
 * Brings what changed in the activity in Garmin Connect (cut at the start or the end, a new distance).
 * The sync does it on its own for the last few days; this does it for any activity, at once.
 */
function RefreshFromGarmin({ activity }: { activity: Activity }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setBusy(true)
    try {
      toast({ message: REFRESHED[await refreshFromGarmin(activity)] })
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível falar com o Garmin.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="ghost" className="w-full" disabled={busy} onClick={() => void refresh()}>
      <RefreshCw size={16} className={cx(busy && 'animate-spin')} /> {busy ? 'Conferindo no Garmin…' : 'Atualizar com o Garmin'}
    </Button>
  )
}
