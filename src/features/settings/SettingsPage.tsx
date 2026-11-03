import { Download, LogOut, RefreshCw, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useToast } from '../../components/Toast'
import { Button, Card, Field, IconButton, Page, TextInput } from '../../components/ui'
import { exportBackup, importBackup } from '../../db/backup'
import { useSettings } from '../../db/hooks'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import { dayKey } from '../../lib/dates'
import { signIn, signOut, syncNow, useSyncState } from '../../sync/controller'
import { GarminCard } from '../garmin/GarminCard'
import { SyncStatus } from './SyncStatus'

export default function SettingsPage() {
  return (
    <Page title="Ajustes">
      <SyncCard />
      <GarminCard />
      <SitesCard />
      <BackupCard />
      <StorageCard />
    </Page>
  )
}

function SyncCard() {
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

/** "Antebraço esquerdo" -> "antebraco_esquerdo". */
function siteKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function SitesCard() {
  const { measurementSites: sites } = useSettings()
  const [label, setLabel] = useState('')

  async function add(event: FormEvent) {
    event.preventDefault()
    const name = label.trim()
    if (!name) return
    const base = siteKey(name) || 'local'
    let key = base
    for (let n = 2; sites.some((site) => site.key === key); n++) key = `${base}_${n}`
    await patch(db.settings, SETTINGS_ID, { measurementSites: [...sites, { key, label: name }] })
    setLabel('')
  }

  return (
    <Card title="Locais de medida">
      <p className="mb-2 text-xs text-muted">
        Remover um local só o tira do formulário; as medidas antigas continuam salvas.
      </p>
      <ul className="divide-y divide-line">
        {sites.map((site) => (
          <li key={site.key} className="flex items-center justify-between gap-2 py-0.5">
            <span className="text-sm">{site.label}</span>
            <IconButton
              label={`Remover ${site.label}`}
              onClick={() =>
                void patch(db.settings, SETTINGS_ID, { measurementSites: sites.filter((s) => s.key !== site.key) })
              }
            >
              <X size={16} />
            </IconButton>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-2 flex gap-2">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Novo local (ex.: Antebraço)" />
        <Button type="submit" disabled={!label.trim()}>
          Adicionar
        </Button>
      </form>
    </Card>
  )
}

function BackupCard() {
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)

  async function onExport() {
    const backup = await exportBackup(db)
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `fitness-backup-${dayKey()}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function onImport(file: File) {
    try {
      const written = await importBackup(db, JSON.parse(await file.text()))
      toast({ message: written > 0 ? `${written} registros importados` : 'Nada novo para importar' })
    } catch (error) {
      toast({ message: error instanceof SyntaxError ? 'Arquivo inválido.' : String((error as Error).message ?? error) })
    }
  }

  return (
    <Card title="Backup">
      <p className="mb-3 text-sm text-ink-2">
        Exporte tudo para um arquivo e importe em outro aparelho. Importar não apaga nada: só traz o que for mais recente.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void onExport()}>
          <Download size={16} /> Exportar
        </Button>
        <Button size="sm" onClick={() => fileInput.current?.click()}>
          <Upload size={16} /> Importar
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onImport(file)
          event.target.value = ''
        }}
      />
    </Card>
  )
}

function StorageCard() {
  const [persisted, setPersisted] = useState<boolean>()
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  return (
    <Card title="Armazenamento">
      <p className="text-sm text-ink-2">
        Os dados ficam primeiro neste aparelho, então o app funciona sem internet.{' '}
        {persisted === false &&
          'O navegador não garantiu que eles não serão apagados se faltar espaço: ligue a sincronização ou faça backups.'}
        {persisted === true && 'O navegador marcou esses dados como persistentes.'}
      </p>
    </Card>
  )
}
