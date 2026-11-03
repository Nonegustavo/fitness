import { History, RefreshCw } from 'lucide-react'
import { Button, Card, cx } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { dayKey, formatDay, formatTime, relativeDay } from '../../lib/dates'
import { useSyncState } from '../../sync/controller'
import { importOlder, syncGarmin, useGarminState } from './sync'

/** Settings: the Garmin sync's status, buttons and how to set it up. */
export function GarminCard() {
  const sync = useSyncState()
  const garmin = useGarminState()
  const today = useToday()
  if (!sync.configured) return null
  const busy = garmin.phase === 'syncing'

  return (
    <Card title="Garmin">
      {!sync.email ? (
        <p className="text-sm text-ink-2">
          Entre na sua conta, acima, para buscar atividades, sono e recuperação do Garmin.
        </p>
      ) : (
        <>
          <p className="text-sm">
            {busy
              ? (garmin.progress ?? 'Buscando…')
              : garmin.lastRunAt
                ? `Última busca: ${relativeDay(dayKey(garmin.lastRunAt), today)}, ${formatTime(garmin.lastRunAt)}`
                : 'Nenhuma busca ainda.'}
          </p>
          {garmin.message && !busy && (
            <p className={cx('mt-1 text-sm', garmin.phase === 'error' ? 'text-critical' : 'text-ink-2')}>{garmin.message}</p>
          )}
          {garmin.historyFrom && (
            <p className="mt-1 text-xs text-muted">Dados desde {formatDay(garmin.historyFrom, "d 'de' MMMM 'de' yyyy")}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void syncGarmin()}>
              <RefreshCw size={16} /> Buscar agora
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void importOlder(90)}>
              <History size={16} /> Buscar 3 meses anteriores
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">O app também busca sozinho, a cada 3 horas, enquanto está aberto.</p>
        </>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-2 select-none hover:text-ink">Como ligar</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-ink-2">
          <li>
            No site do Garmin Connect, abra{' '}
            <a
              href="https://connect.garmin.com/app/settings/personalApiToken"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent-ink underline underline-offset-2"
            >
              Personal API Token
            </a>
            , toque em <strong>Create Key</strong>, aceite os termos e escolha a validade de 1 ano.
          </li>
          <li>
            No Supabase, em <strong>Edge Functions → Secrets</strong>, salve a chave com o nome <code>GARMIN_API_KEY</code>.
            Ela é só sua: não cole em nenhum outro lugar.
          </li>
          <li>
            Opcional, para ver os treinos agendados (do SisRUN, por exemplo): no Garmin Connect, publique o calendário e
            salve o link do mesmo jeito, com o nome <code>GARMIN_CALENDAR_URL</code>.
          </li>
        </ol>
      </details>
    </Card>
  )
}
