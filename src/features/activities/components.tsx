import { Heart, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useToast } from '../../components/Toast'
import { Button } from '../../components/ui'
import type { Activity } from '../../db/types'
import { formatTime, relativeDay } from '../../lib/dates'
import { formatDuration } from '../../lib/format'
import { activityIcon, activityLabel, formatDistance, formatSpeed, speedKind } from './activities'
import { WeatherChip } from './WeatherView'

/** Picks .fit or .zip files (one or many) and imports them. */
export function ImportFitButton({ size = 'sm', variant = 'secondary' }: { size?: 'sm' | 'md'; variant?: 'primary' | 'secondary' }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  async function onFiles(files: File[]) {
    setBusy(true)
    try {
      // Loaded on demand: the FIT SDK is large and only needed here.
      const { importFitFiles } = await import('./importFit')
      const { imported, failed } = await importFitFiles(files)
      const parts: string[] = []
      if (imported.length > 0) parts.push(imported.length === 1 ? '1 atividade importada' : `${imported.length} atividades importadas`)
      if (failed.length === 1) parts.push(`${failed[0].name}: ${failed[0].reason}`)
      if (failed.length > 1) parts.push(`${failed.length} arquivos não puderam ser lidos`)
      toast({
        message: parts.join('. ') || 'Nenhuma atividade nos arquivos.',
        action:
          imported.length === 1
            ? { label: 'Ver', onClick: () => navigate(`/treinos/atividades/${imported[0]}`) }
            : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size={size} variant={variant} disabled={busy} onClick={() => input.current?.click()}>
        <Upload size={16} /> {busy ? 'Importando…' : 'Importar .FIT'}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".fit,.zip"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ''
          if (files.length > 0) void onFiles(files)
        }}
      />
    </>
  )
}

export function ActivityRow({ activity, today }: { activity: Activity; today: string }) {
  const Icon = activityIcon(activity)
  const kind = speedKind(activity)
  const details = [formatDuration(activity.timerSec * 1000)]
  if (activity.distanceM) details.push(formatDistance(activity.distanceM))
  if (activity.distanceM && activity.avgSpeed) details.push(formatSpeed(activity.avgSpeed, kind))
  return (
    <li>
      <Link to={`/treinos/atividades/${activity.id}`} className="flex items-center gap-3 py-2 hover:text-accent-ink">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          {/* The weather beside the name, where a long details line can't push it out of sight. */}
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{activity.title ?? activityLabel(activity)}</span>
            {activity.weather && (
              <span className="shrink-0 text-xs font-normal text-muted">
                <WeatherChip activity={activity} />
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted first-letter:uppercase">
            {activity.title && `${activityLabel(activity)} · `}
            {relativeDay(activity.date, today)}, {formatTime(activity.startTime)} · {details.join(' · ')}
          </p>
        </div>
        {activity.avgHr !== undefined && (
          <span className="flex shrink-0 items-center gap-1 text-sm text-ink-2 tabular-nums">
            <Heart size={14} aria-hidden />
            {activity.avgHr}
            <span className="sr-only">bpm de média</span>
          </span>
        )}
      </Link>
    </li>
  )
}

/** Where the .FIT files come from, for empty lists. */
export function FitHowTo() {
  return (
    <p className="text-sm text-ink-2">
      No site do Garmin Connect, abra a atividade, clique na engrenagem e escolha <strong>Exportar original</strong>.
      O app aceita o .zip baixado, sem precisar descompactar, e vários arquivos de uma vez.
    </p>
  )
}
