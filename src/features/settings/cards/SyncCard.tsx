import { LogOut, RefreshCw } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button, Card, Field, TextInput } from '../../../components/ui'
import { signIn, signOut, syncNow, useSyncState } from '../../../sync/controller'
import { SyncStatus } from '../SyncStatus'

export function SyncCard() {
  const sync = useSyncState()

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

  if (!sync.email) {
    return (
      <Card title="Sincronização">
        <LoginForm />
      </Card>
    )
  }

  return (
    <Card title="Sincronização">
      <p className="text-sm">
        Conectado como <strong>{sync.email}</strong>
      </p>
      <div className="mt-1 text-sm">
        <SyncStatus />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={sync.phase === 'syncing'} onClick={() => void syncNow()}>
          <RefreshCw size={16} /> Sincronizar agora
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void signOut()}>
          <LogOut size={16} /> Sair
        </Button>
      </div>
    </Card>
  )
}

/** The account is created once in the Supabase dashboard (see README), so there is no sign-up here. */
function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-ink-2">Entre com a sua conta para sincronizar este aparelho com os outros.</p>
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
      {error && <p className="text-sm text-critical">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        Entrar
      </Button>
    </form>
  )
}
