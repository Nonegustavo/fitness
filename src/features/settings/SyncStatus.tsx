import { useLiveQuery } from 'dexie-react-hooks'
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '../../components/ui'
import { useNow } from '../../db/hooks'
import { db } from '../../db/schema'
import { useSyncState } from '../../sync/controller'
import { countPending } from '../../sync/engine'
import { needsAttention, whenText, worstSource } from '../status/health'
import { useSourceHealth } from '../status/useSourceHealth'

function Line({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return <span className={cx('flex items-center gap-1.5', className)}>{icon}<span className="min-w-0">{children}</span></span>
}

/** The sync's own state in one line (inside the sync's card), with the day of the last success. */
export function SyncLine() {
  const sync = useSyncState()
  const pending = useLiveQuery(() => countPending(db)) ?? 0
  const now = useNow(60_000).getTime()
  const pendingText = pending > 0 ? ` · ${pending} pendente${pending > 1 ? 's' : ''}` : ''

  if (!sync.configured) return <Line icon={<CloudOff size={14} />} className="text-muted">Só neste aparelho</Line>
  if (sync.expired) {
    return <Line icon={<TriangleAlert size={14} />} className="text-critical">Sua sessão expirou. Entre de novo.</Line>
  }
  if (!sync.email) return <Line icon={<CloudOff size={14} />} className="text-muted">Sincronização desligada</Line>

  switch (sync.phase) {
    case 'syncing':
      return <Line icon={<RefreshCw size={14} className="animate-spin" />} className="text-ink-2">Sincronizando…</Line>
    case 'offline':
      return <Line icon={<CloudOff size={14} />} className="text-ink-2">Sem internet{pendingText}</Line>
    case 'error':
      return (
        <span className="block">
          <Line icon={<TriangleAlert size={14} />} className="text-critical">{sync.error ?? 'Erro ao sincronizar.'}</Line>
          {sync.errorDetail && <span className="mt-0.5 block text-xs break-words text-muted">{sync.errorDetail}</span>}
        </span>
      )
    default:
      return (
        <Line icon={<Cloud size={14} />} className="text-ink-2">
          {sync.lastOkAt ? `Sincronizado ${whenText(sync.lastOkAt, now)}` : 'Conectado'}
          {pendingText}
        </Line>
      )
  }
}

/** Lowercases the first letter, for the text after "Garmin: ". */
const continued = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/**
 * The bottom of the desktop sidebar: the source that needs a look ("Garmin: a última busca falhou"),
 * linking to "Estado das fontes"; the sync's line when all is well.
 */
export function SyncStatus() {
  const worst = worstSource(useSourceHealth())
  if (!worst || !needsAttention(worst.level)) return <SyncLine />
  return (
    <Link to="/ajustes?secao=estado" className="block rounded-md hover:underline">
      <Line
        icon={<TriangleAlert size={14} className={cx('shrink-0', worst.level === 'warn' && 'text-(--tone-habits)')} />}
        className={worst.level === 'error' ? 'text-critical' : 'text-ink-2'}
      >
        {worst.name}: {continued(worst.text)}
      </Line>
    </Link>
  )
}
