import { CircleAlert, CircleCheck, CircleMinus, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Card, cx } from '../../components/ui'
import { useNow } from '../../db/hooks'
import { syncNow, useSyncState } from '../../sync/controller'
import { uploadPendingPhotos } from '../food/photos'
import { syncGarmin } from '../garmin/sync'
import { importHealthConnect } from '../healthconnect/sync'
import { importCoachPlan } from '../sisrun/coachPlan'
import { whenText, type HealthLevel, type SourceHealth, type SourceId } from './health'
import { useSourceHealth } from './useSourceHealth'

const ICONS: Record<HealthLevel, { icon: LucideIcon; className: string; label: string }> = {
  ok: { icon: CircleCheck, className: 'text-good', label: 'Tudo certo' },
  warn: { icon: TriangleAlert, className: 'text-(--tone-habits)', label: 'Atenção' },
  error: { icon: CircleAlert, className: 'text-critical', label: 'Com problema' },
  off: { icon: CircleMinus, className: 'text-muted', label: 'Desligado' },
}

/** What each source's "do it now" button runs. */
const RUN: Partial<Record<NonNullable<SourceHealth['action']>, { label: string; run: () => Promise<void> }>> = {
  sync: { label: 'Sincronizar', run: syncNow },
  garmin: { label: 'Buscar agora', run: syncGarmin },
  healthConnect: { label: 'Importar agora', run: () => importHealthConnect() },
  sisrun: { label: 'Ler agora', run: () => importCoachPlan({ force: true }) },
  photos: { label: 'Enviar agora', run: uploadPendingPhotos },
}

/** Where a source not set up yet is set up: its card in Ajustes. */
const SETUP: Partial<Record<SourceId, { to: string; label: string }>> = {
  sync: { to: '/ajustes?secao=sincronizacao', label: 'Entrar' },
  garmin: { to: '/ajustes?secao=garmin', label: 'Como ligar' },
  sisrun: { to: '/ajustes?secao=sisrun', label: 'Como ligar' },
  healthConnect: { to: '/ajustes?secao=health-connect', label: 'Abrir' },
}

const SMALL = 'h-8 shrink-0 px-2.5 text-xs'

function Action({ source }: { source: SourceHealth }) {
  const [busy, setBusy] = useState(false)
  if (!source.action) return null
  const link = source.action === 'signIn' ? SETUP.sync : source.action === 'setup' ? SETUP[source.id] : undefined
  if (link) {
    return (
      <Link
        to={link.to}
        className={cx(SMALL, 'inline-flex items-center rounded-xl font-medium text-accent-ink hover:bg-surface-2')}
      >
        {link.label}
      </Link>
    )
  }
  const action = RUN[source.action]
  if (!action) return null
  return (
    <Button
      size="sm"
      className={SMALL}
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void action.run().finally(() => setBusy(false))
      }}
    >
      {action.label}
    </Button>
  )
}

function Row({ source, now }: { source: SourceHealth; now: number }) {
  const { icon: Icon, className, label } = ICONS[source.level]
  // A source that works says when in its text; one with a problem says when it last worked.
  const lastOk = source.lastOkAt !== undefined && (source.level === 'warn' || source.level === 'error')
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <Icon size={18} aria-label={label} role="img" className={cx('mt-px shrink-0', className)} />
      <div className="min-w-0 flex-1 text-sm">
        <p>
          <span className="font-medium">{source.name}</span>{' '}
          <span className={source.level === 'off' ? 'text-muted' : 'text-ink-2'}>· {source.text}</span>
        </p>
        {source.detail && <p className="mt-0.5 text-xs break-words text-muted">{source.detail}</p>}
        {lastOk && <p className="mt-0.5 text-xs text-muted">Funcionou pela última vez {whenText(source.lastOkAt!, now)}</p>}
      </div>
      <Action source={source} />
    </li>
  )
}

/**
 * Ajustes' first card: every source of data (the sync, Garmin, Health Connect, SisRUN, the photos still
 * to send), when each last worked and what to do when one didn't.
 */
export function StatusCard() {
  const sync = useSyncState()
  const sources = useSourceHealth()
  const now = useNow(60_000).getTime()
  if (!sync.configured) return null
  return (
    <Card title="Estado das fontes">
      <ul className="-my-1.5 divide-y divide-line">
        {sources.map((source) => (
          <Row key={source.id} source={source} now={now} />
        ))}
      </ul>
    </Card>
  )
}
