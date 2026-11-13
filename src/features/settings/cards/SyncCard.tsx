import { LogOut, RefreshCw, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Confirm } from '../../../components/Modal'
import { Button, Card, Field, Skeleton, TextInput } from '../../../components/ui'
import { signIn, signOut, syncNow, useSyncState } from '../../../sync/controller'
import { describeSyncError, type SyncProblem } from '../../../sync/errors'
import { SyncLine } from '../SyncStatus'

export function SyncCard() {
  const sync = useSyncState()
  const [leaving, setLeaving] = useState(false)

  if (!sync.configured) {
    return (
      <Card title="Sincronização">
        <p className="text-sm text-ink-2">
          Ainda não configurada: os dados ficam só neste aparelho. O passo a passo para ligar a sincronização com o
          Supabase está no README do projeto.
        </p>
      </Card>
    )
  }

  // The saved login is still being read: neither the form nor "connected" yet.
  if (!sync.authChecked) {
    return (
      <Card title="Sincronização">
        <div aria-busy="true" aria-label="Carregando">
          <Skeleton className="h-4 w-2/3" />
        </div>
      </Card>
    )
  }

  if (!sync.email) {
    return (
      <Card title="Sincronização">
        {sync.expired && (
          <p className="mb-3 flex items-center gap-1.5 text-sm text-critical">
            <TriangleAlert size={16} className="shrink-0" /> Sua sessão expirou. Entre de novo.
          </p>
        )}
        {/* Keyed by the e-mail, so the form fills in once the saved account is known. */}
        <LoginForm key={sync.accountEmail ?? ''} initialEmail={sync.accountEmail ?? ''} again={sync.expired} />
      </Card>
    )
  }

  return (
    <Card title="Sincronização">
      <p className="text-sm">
        Conectado como <strong>{sync.email}</strong>
      </p>
      <div className="mt-1 text-sm">
        <SyncLine />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={sync.phase === 'syncing'} onClick={() => void syncNow()}>
          <RefreshCw size={16} /> Sincronizar agora
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setLeaving(true)}>
          <LogOut size={16} /> Sair
        </Button>
      </div>
      {leaving && (
        <Confirm
          title="Sair desta conta neste aparelho?"
          message="Os dados continuam neste aparelho, mas param de sincronizar até você entrar de novo. Os outros aparelhos continuam conectados."
          confirmLabel="Sair"
          onConfirm={() => void signOut()}
          onClose={() => setLeaving(false)}
        />
      )}
    </Card>
  )
}

/** The account is created once in the Supabase dashboard (see README), so there is no sign-up here. */
function LoginForm({ initialEmail, again }: { initialEmail: string; again: boolean }) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<SyncProblem | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (cause) {
      setError(describeSyncError(cause, 'Não deu para entrar.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!again && <p className="text-sm text-ink-2">Entre com a sua conta para sincronizar este aparelho com os outros.</p>}
      <Field label="E-mail">
        <TextInput type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Senha">
        <TextInput
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error && (
        <div>
          <p className="text-sm text-critical">{error.message}</p>
          {error.detail && <p className="mt-0.5 text-xs break-words text-muted">{error.detail}</p>}
        </div>
      )}
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        Entrar
      </Button>
    </form>
  )
}
