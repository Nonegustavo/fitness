/**
 * Ajustes, in the Android app: which version is running, when it last looked for a newer one, and the
 * buttons to look now, to switch to a waiting version and to go back to the installed one. On the
 * website, just the version.
 */
import { format } from 'date-fns'
import { RefreshCw, RotateCcw, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { showToast } from '../components/Toast'
import { Button, Card } from '../components/ui'
import { isAndroidApp } from '../features/healthconnect/plugin'
import { backToInstalled, restartIntoUpdate } from './boot'
import { updateStatus, type UpdateStatus } from './decide'
import { RUNNING } from './native'
import { loadSnapshot, useOta } from './store'
import { checkForUpdate } from './update'

const when = (ms: number) => format(ms, "dd/MM 'às' HH:mm")

/** "Versão abc1234, de 12/11 às 15:40" */
const versionLabel = (build: string, time: number) => (time > 0 ? `Versão ${build}, de ${when(time * 1000)}` : `Versão ${build}`)

const STATUS: Record<UpdateStatus, string> = {
  checking: 'Procurando versão nova…',
  downloading: 'Baixando a versão nova…',
  ready: 'Versão nova pronta: entra ao reabrir o app.',
  needsCable: 'Há uma versão nova, mas esta precisa ser instalada pelo cabo.',
  failed: 'A última versão baixada não iniciou e foi descartada.',
  error: 'Não deu para procurar versão nova.',
  current: 'Em dia.',
}

export function AppUpdateCard() {
  if (!isAndroidApp()) {
    return <p className="px-1 text-sm text-muted">{versionLabel(RUNNING.build, RUNNING.time)}</p>
  }
  return <AndroidUpdateCard />
}

function AndroidUpdateCard() {
  const ota = useOta()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void loadSnapshot().catch(() => undefined)
  }, [])

  const state = ota.state ?? { bad: [] }
  const status = updateStatus(ota.phase, ota.error, state, RUNNING, ota.nativeLevel)
  const downloaded = ota.served?.startsWith('/') ?? false

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Atualização do app">
      <p className="text-sm">
        {versionLabel(RUNNING.build, RUNNING.time)}
        <span className="text-ink-2">{downloaded ? ', baixada do site.' : ', a que veio com o app.'}</span>
      </p>
      <p className="mt-1 text-sm text-ink-2">
        {state.checkedAt ? `Procurou em ${when(state.checkedAt)}.` : 'Ainda não procurou versão nova.'}
      </p>
      <p className="mt-1 text-sm" role="status">
        {STATUS[status]}
        {status === 'error' && ota.error && <span className="text-ink-2"> {ota.error}</span>}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || ota.phase !== 'idle'}
          onClick={() => void run(() => checkForUpdate(true))}
        >
          <RefreshCw size={16} /> Procurar atualização
        </Button>
        {status === 'ready' && (
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void run(restartIntoUpdate)}>
            <RotateCcw size={16} /> Reiniciar para atualizar
          </Button>
        )}
        {downloaded && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(backToInstalled)}>
            <Undo2 size={16} /> Voltar à versão instalada
          </Button>
        )}
      </div>
    </Card>
  )
}
