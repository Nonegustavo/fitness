import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, cx, Switch } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import { dayKey, formatTime, relativeDay } from '../../lib/dates'
import { useSyncState } from '../../sync/controller'
import { isAndroidApp } from '../healthconnect/plugin'
import { requestNotificationPermission } from '../notifications/native'
import { coachConfigured, importCoachPlan, planWorkouts, useCoachPlan } from './coachPlan'
import { syncWatch } from './watch'

/** Settings: the coach's plan read from SisRUN, when, what went wrong, and how to set it up. */
export function SisrunCard() {
  const sync = useSyncState()
  const plan = useCoachPlan()
  const settings = useSettings()
  const today = useToday()
  const [busy, setBusy] = useState(false)
  if (!sync.configured) return null

  const ahead = planWorkouts(plan).filter((workout) => workout.date >= today && workout.status !== 'Feito Avulso')
  // A problem after the last good read; an older one was solved since.
  const error = plan?.error && (!plan.fetchedAt || plan.error.at > plan.fetchedAt) ? plan.error : undefined
  const read = async () => {
    setBusy(true)
    await importCoachPlan({ force: true })
    // The first read turns the alerts on, with what it found.
    await syncWatch()
    setBusy(false)
  }
  const setAlerts = async (on: boolean) => {
    if (on) await requestNotificationPermission()
    await patch(db.settings, SETTINGS_ID, { sisrunAlerts: on })
    await syncWatch()
  }

  return (
    <Card title="SisRUN">
      {!sync.email ? (
        <p className="text-sm text-ink-2">Entre na sua conta, acima, para ler a planilha do SisRUN.</p>
      ) : (
        <>
          <p className="text-sm">
            {busy
              ? 'Lendo a planilha…'
              : plan?.fetchedAt
                ? `Planilha lida ${relativeDay(dayKey(plan.fetchedAt), today)}, ${formatTime(plan.fetchedAt)}`
                : 'A planilha ainda não foi lida.'}
          </p>
          {!busy && plan?.fetchedAt && !error && (
            <p className="mt-1 text-sm text-ink-2">
              {ahead.length === 0
                ? 'Nenhum treino daqui para a frente.'
                : ahead.length === 1
                  ? '1 treino daqui para a frente, com as etapas na ficha de cada corrida.'
                  : `${ahead.length} treinos daqui para a frente, com as etapas na ficha de cada corrida.`}
            </p>
          )}
          {!busy && error && <p className={cx('mt-1 text-sm', error.missing ? 'text-ink-2' : 'text-critical')}>{error.message}</p>}
          <div className="mt-3">
            <Button size="sm" disabled={busy} onClick={() => void read()}>
              <RefreshCw size={16} /> Ler agora
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            O app só consulta o SisRUN quando o calendário do Garmin traz um treino do SisRUN que ele ainda não leu: a semana
            nova que o treinador publicou, ou um treino que ele mudou. Ler agora consulta na hora.
          </p>
          {isAndroidApp() && coachConfigured(plan) && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm">Avisar quando chegar treino novo</span>
                  <span className="block text-xs text-muted">
                    O celular confere o calendário do Garmin a cada 3 horas, mesmo com o app fechado, sem consultar o SisRUN.
                  </span>
                </span>
                <Switch
                  checked={settings.sisrunAlerts !== false}
                  label="Avisar quando chegar treino novo"
                  onChange={(on) => void setAlerts(on)}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                No Xiaomi, para o aviso não atrasar: Configurações → Apps → Fitness, ligue o Início automático e deixe a bateria
                Sem restrições.
              </p>
            </div>
          )}
        </>
      )}
      <details className="mt-3 text-sm" open={!!error?.missing}>
        <summary className="cursor-pointer text-ink-2 select-none hover:text-ink">Como ligar</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-ink-2">
          <li>
            No Supabase, em <strong>Edge Functions → Secrets</strong>, crie <code>SISRUN_EMAIL</code> com o e-mail que você usa no
            app do aluno do SisRUN e <code>SISRUN_PASSWORD</code> com a senha.
          </li>
          <li>
            Toque em <strong>Ler agora</strong>.
          </li>
        </ol>
        <p className="mt-2 text-xs text-muted">
          O SisRUN não tem API: a função do app entra no site do aluno com essa senha só para ler a planilha, e nunca muda nada lá.
          A senha fica só nos segredos do Supabase. Não é um recurso do SisRUN e pode parar de funcionar se o site mudar; a leitura
          foi adaptada do projeto sisrun-mcp (licença MIT).
        </p>
      </details>
    </Card>
  )
}
