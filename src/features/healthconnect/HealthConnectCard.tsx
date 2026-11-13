import { History, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect } from 'react'
import { Button, Card, cx } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { dayKey, formatTime, relativeDay } from '../../lib/dates'
import { isAndroidApp } from './plugin'
import { connectHealthConnect, importHealthConnect, refreshHealthConnect, useHealthConnectState } from './sync'

const LABELS: Record<string, string> = {
  weight: 'peso',
  bodyFat: 'gordura',
  leanMass: 'massa magra',
  boneMass: 'massa óssea',
  bodyWater: 'água',
  bmr: 'metabolismo basal',
  sleep: 'fases do sono',
}

/** Settings, in the Android app only: Health Connect's access and imports. */
export function HealthConnectCard() {
  const hc = useHealthConnectState()
  const today = useToday()
  useEffect(() => {
    if (isAndroidApp()) void refreshHealthConnect()
  }, [])
  if (!isAndroidApp()) return null

  const busy = hc.phase === 'busy'
  const granted = hc.access?.granted ?? []

  return (
    <Card title="Health Connect">
      {hc.availability === undefined ? (
        <p className="text-sm text-muted">Verificando…</p>
      ) : hc.availability === 'unavailable' ? (
        <p className="text-sm text-ink-2">O Health Connect não está disponível neste aparelho.</p>
      ) : hc.availability === 'update_required' ? (
        <p className="text-sm text-ink-2">Atualize o Health Connect pela Play Store e volte aqui.</p>
      ) : granted.length === 0 ? (
        <>
          <p className="text-sm text-ink-2">
            Permita que o app leia a balança (peso, gordura, massa magra, massa óssea, água e metabolismo basal) e as
            fases do sono do relógio. Ele só lê; nada é alterado no Health Connect.
          </p>
          <Button size="sm" variant="primary" className="mt-3" onClick={() => void connectHealthConnect()}>
            <ShieldCheck size={16} /> Permitir acesso
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm">Lendo: {granted.map((type) => LABELS[type] ?? type).join(', ')}.</p>
          <p className="mt-1 text-sm text-ink-2">
            {busy
              ? 'Importando…'
              : hc.lastOkAt
                ? `Última importação com sucesso: ${relativeDay(dayKey(hc.lastOkAt), today)}, ${formatTime(hc.lastOkAt)}`
                : 'Nenhuma importação ainda.'}
          </p>
          {!busy &&
            (hc.lastError ? (
              // Kept across restarts, until an import works.
              <p className="mt-1 text-sm text-critical">
                A importação de {relativeDay(dayKey(hc.lastError.at), today)}, {formatTime(hc.lastError.at)} falhou:{' '}
                {hc.lastError.message}
              </p>
            ) : (
              hc.message && <p className={cx('mt-1 text-sm', hc.phase === 'error' ? 'text-critical' : 'text-ink-2')}>{hc.message}</p>
            ))}
          {!hc.access?.history && (
            <p className="mt-1 text-xs text-muted">
              Sem a permissão de histórico, o Health Connect só mostra os últimos 30 dias.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void importHealthConnect()}>
              <RefreshCw size={16} /> Importar agora
            </Button>
            {hc.access?.history ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void importHealthConnect({ full: true })}>
                <History size={16} /> Importar todo o histórico
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void connectHealthConnect()}>
                <ShieldCheck size={16} /> Revisar permissões
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
