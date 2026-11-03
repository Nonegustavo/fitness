import { useLiveQuery } from 'dexie-react-hooks'
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../../components/ui'
import { db } from '../../db/schema'
import { formatTime } from '../../lib/dates'
import { useSyncState } from '../../sync/controller'
import { countPending } from '../../sync/engine'

function Line({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return <span className={cx('flex items-center gap-1.5', className)}>{icon}<span className="min-w-0">{children}</span></span>
}

/** One-line sync state, for the sidebar and the settings page. */
export function SyncStatus() {
  const sync = useSyncState()
  const pending = useLiveQuery(() => countPending(db)) ?? 0
  const pendingText = pending > 0 ? ` · ${pending} pendente${pending > 1 ? 's' : ''}` : ''

  if (!sync.configured) return <Line icon={<CloudOff size={14} />} className="text-muted">Só neste aparelho</Line>
  if (!sync.email) return <Line icon={<CloudOff size={14} />} className="text-muted">Sincronização desligada</Line>

  switch (sync.phase) {
    case 'syncing':
      return <Line icon={<RefreshCw size={14} className="animate-spin" />} className="text-ink-2">Sincronizando…</Line>
    case 'offline':
      return <Line icon={<CloudOff size={14} />} className="text-ink-2">Sem internet{pendingText}</Line>
    case 'error':
      return <Line icon={<TriangleAlert size={14} />} className="text-critical">Erro ao sincronizar: {sync.error}</Line>
    default:
      return (
        <Line icon={<Cloud size={14} />} className="text-ink-2">
          {sync.lastSyncAt ? `Sincronizado às ${formatTime(sync.lastSyncAt)}` : 'Conectado'}
          {pendingText}
        </Line>
      )
  }
}
