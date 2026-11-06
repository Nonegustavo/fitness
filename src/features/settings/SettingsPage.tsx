import { Download, LogOut, RefreshCw, Settings, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useToast } from '../../components/Toast'
import { bottomSections, SECTIONS } from '../../components/sections'
import { SortableList } from '../../components/Sortable'
import { Button, Card, Field, IconButton, Page, Select, Switch, TextInput } from '../../components/ui'
import { exportBackup, importBackup } from '../../db/backup'
import { useSettings } from '../../db/hooks'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import { dayKey } from '../../lib/dates'
import { signIn, signOut, syncNow, useSyncState } from '../../sync/controller'
import { GarminCard } from '../garmin/GarminCard'
import { HealthConnectCard } from '../healthconnect/HealthConnectCard'
import { SisrunCard } from '../sisrun/SisrunCard'
import { SyncStatus } from './SyncStatus'
import { PROFILE_CHARS } from '../analysis/context'
import { isAndroidApp } from '../healthconnect/plugin'
import { requestNotificationPermission } from '../notifications/native'
import { leadText, WORKOUT_LEADS } from '../notifications/reminders'
import type { SmartReminders } from '../../db/types'
import { useSearchParams } from 'react-router'

export default function SettingsPage() {
  return (
    <Page title="Ajustes" icon={Settings} tone="settings">
      <SyncCard />
      <ProfileCard />
      {isAndroidApp() && <SmartRemindersCard />}
      {isAndroidApp() && <WorkoutRemindersCard />}
      <NavBarCard />
      <GarminCard />
      <SisrunCard />
      <HealthConnectCard />
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
        Arraste para mudar a ordem do formulário, da tabela e do gráfico em Corpo. Remover um local só o tira do
        formulário; as medidas antigas continuam salvas.
      </p>
      <SortableList
        className="divide-y divide-line"
        itemClassName="flex items-center gap-2 bg-surface py-0.5"
        items={sites}
        getId={(site) => site.key}
        onReorder={(list) => void patch(db.settings, SETTINGS_ID, { measurementSites: list })}
      >
        {(site, handle) => (
          <>
            <span className="-ml-2 flex">{handle}</span>
            <span className="min-w-0 flex-1 text-sm">{site.label}</span>
            <IconButton
              label={`Remover ${site.label}`}
              onClick={() =>
                void patch(db.settings, SETTINGS_ID, { measurementSites: sites.filter((s) => s.key !== site.key) })
              }
            >
              <X size={16} />
            </IconButton>
          </>
        )}
      </SortableList>
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

const PROFILE_PLACEHOLDER = `Ex.: 34 anos, 1,78 m. Trabalho presencial de seg a qua, home office qui e sex.
Musculação 4x por semana (ABCD) às 18h e corrida com planilha do SisRUN.
Objetivo: perder 5 kg de gordura até março mantendo a força; correr 10 km abaixo de 50 min.
Tenho tendinite no ombro direito. Durmo mal quando treino tarde.`

/** The user in their own words, read by the daily analysis and in the summary to paste in Claude. */
function ProfileCard() {
  const toast = useToast()
  const settings = useSettings()
  const [params] = useSearchParams()
  const [text, setText] = useState<string | null>(null)
  const ref = useRef<HTMLElement>(null)
  const saved = settings.profile ?? ''
  const value = text ?? saved

  useEffect(() => {
    if (params.get('secao') === 'sobre-mim') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [params])

  async function submit(event: FormEvent) {
    event.preventDefault()
    await patch(db.settings, SETTINGS_ID, { profile: value.trim() || undefined })
    setText(null)
    toast({ message: 'Sobre mim salvo' })
  }

  return (
    <section ref={ref} className="scroll-mt-4">
      <Card title="Sobre mim">
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-ink-2">
            Sua idade, rotina, histórico, limitações e objetivos. A análise do dia lê isto junto com os dados, e ele vai no
            resumo para colar no Claude.
          </p>
          <textarea
            rows={7}
            maxLength={PROFILE_CHARS}
            value={value}
            onChange={(e) => setText(e.target.value)}
            placeholder={PROFILE_PLACEHOLDER}
            className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent/30"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted tabular-nums">
              {value.length}/{PROFILE_CHARS}
            </span>
            <Button type="submit" size="sm" variant="primary" disabled={value.trim() === saved.trim()}>
              Salvar
            </Button>
          </div>
        </form>
      </Card>
    </section>
  )
}

const SMART_DEFAULTS = { weighIn: '08:30', lunch: '14:00', dinner: '21:30' } as const

/** Reminders that only come when something is missing that day (Android app). */
/** The four sections of the phone's bottom bar; the others stay under "Mais". */
function NavBarCard() {
  const settings = useSettings()
  const current = bottomSections(settings.navBar).map((section) => section.to)
  const choose = (slot: number, path: string) => {
    const next = [...current]
    // A section already on the bar trades places with the one it replaces.
    const taken = next.indexOf(path)
    if (taken >= 0) next[taken] = next[slot]
    next[slot] = path
    void patch(db.settings, SETTINGS_ID, { navBar: next })
  }
  return (
    <Card title="Barra de baixo">
      <p className="mb-3 text-sm text-ink-2">As quatro seções da barra do celular; as outras ficam em Mais.</p>
      <div className="grid grid-cols-2 gap-3">
        {current.map((path, slot) => (
          <Field key={slot} label={`${slot + 1}ª posição`}>
            <Select value={path} onChange={(event) => choose(slot, event.target.value)}>
              {SECTIONS.filter((section) => section.to !== '/ajustes').map((section) => (
                <option key={section.to} value={section.to}>
                  {section.label}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
      {settings.navBar && (
        <Button size="sm" variant="ghost" className="mt-3" onClick={() => void patch(db.settings, SETTINGS_ID, { navBar: undefined })}>
          Voltar ao padrão
        </Button>
      )}
    </Card>
  )
}

/** Heads-ups before the planned workouts, and the week in numbers on Sunday night. */
function WorkoutRemindersCard() {
  const settings = useSettings()
  const smart = settings.smartReminders ?? {}
  const change = (next: SmartReminders) => void patch(db.settings, SETTINGS_ID, { smartReminders: next })
  const turnOn = (next: SmartReminders) => {
    void requestNotificationPermission()
    change(next)
  }
  return (
    <Card title="Treinos e semana">
      <ul className="divide-y divide-line">
        <li className="flex items-center gap-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-sm">Antes dos treinos</span>
            <span className="block text-xs text-muted">musculação, corridas e caminhadas programadas com horário</span>
          </span>
          {smart.workouts && (
            <span className="w-32 shrink-0">
              <Select
                aria-label="Quanto tempo antes do treino"
                value={String(smart.workouts)}
                onChange={(event) => change({ ...smart, workouts: Number(event.target.value) })}
              >
                {WORKOUT_LEADS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {leadText(minutes)} antes
                  </option>
                ))}
              </Select>
            </span>
          )}
          <Switch
            label="Aviso antes dos treinos"
            checked={!!smart.workouts}
            onChange={(on) => (on ? turnOn({ ...smart, workouts: 30 }) : change({ ...smart, workouts: undefined }))}
          />
        </li>
        <li className="flex items-center gap-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-sm">Resumo da semana</span>
            <span className="block text-xs text-muted">domingo às 20h: treinos, corrida, sono e água da semana</span>
          </span>
          <Switch
            label="Resumo da semana no domingo"
            checked={!!smart.weekly}
            onChange={(on) => (on ? turnOn({ ...smart, weekly: true }) : change({ ...smart, weekly: undefined }))}
          />
        </li>
      </ul>
    </Card>
  )
}

function SmartRemindersCard() {
  const settings = useSettings()
  const smart = settings.smartReminders ?? {}
  const change = (next: SmartReminders) => void patch(db.settings, SETTINGS_ID, { smartReminders: next })
  const turnOn = (next: SmartReminders) => {
    void requestNotificationPermission()
    change(next)
  }
  const timed = [
    { key: 'weighIn', label: 'Pesagem', detail: 'se ainda não houver pesagem no dia' },
    { key: 'lunch', label: 'Almoço', detail: 'se nada foi registrado no almoço' },
    { key: 'dinner', label: 'Jantar', detail: 'se nada foi registrado no jantar' },
  ] as const
  return (
    <Card title="Lembretes do dia">
      <p className="mb-3 text-sm text-ink-2">Só aparecem quando falta registrar; registrar antes cancela o lembrete.</p>
      <ul className="divide-y divide-line">
        {timed.map(({ key, label, detail }) => (
          <li key={key} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{label}</span>
              <span className="block text-xs text-muted">{detail}</span>
            </span>
            {smart[key] && (
              <span className="w-28 shrink-0">
                <TextInput
                  type="time"
                  aria-label={`Horário do lembrete de ${label.toLowerCase()}`}
                  value={smart[key]}
                  onChange={(e) => e.target.value && change({ ...smart, [key]: e.target.value })}
                />
              </span>
            )}
            <Switch
              label={`Lembrete de ${label.toLowerCase()}`}
              checked={!!smart[key]}
              onChange={(on) => (on ? turnOn({ ...smart, [key]: SMART_DEFAULTS[key] }) : change({ ...smart, [key]: undefined }))}
            />
          </li>
        ))}
        <li className="flex items-center gap-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-sm">Água no ritmo</span>
            <span className="block text-xs text-muted">às 11h, 15h e 19h, se estiver atrás do ritmo da meta</span>
          </span>
          <Switch
            label="Lembrete de água"
            checked={!!smart.water}
            onChange={(on) => (on ? turnOn({ ...smart, water: true }) : change({ ...smart, water: undefined }))}
          />
        </li>
      </ul>
    </Card>
  )
}
