import { Archive, Pencil, Plus, RotateCcw, SportShoe, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Confirm, Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, Card, cx, DecimalInput, Empty, Field, Page, SkeletonCard, Switch, TextInput } from '../../components/ui'
import { useNewFromLink } from '../../components/useNewFromLink'
import { useToday } from '../../db/hooks'
import type { Activity, Gear } from '../../db/types'
import { formatDay, shiftDay, type DayKey } from '../../lib/dates'
import { formatNumber, parseDecimal } from '../../lib/format'
import { useActivities } from '../activities/activities'
import {
  DEFAULT_LIMIT_KM,
  deleteGear,
  fillGear,
  GEAR_USES,
  gearStatus,
  saveGear,
  setRetired,
  useGear,
  withoutGear,
  type GearStatus,
  type GearUse,
} from './gear'
import { GearAlert } from './GearWarning'

/** The default uses of a pair in words: "corridas e caminhadas". */
const usesText = (uses: string[]) =>
  GEAR_USES.filter(({ use }) => uses.includes(use))
    .map(({ plural }) => plural)
    .join(' e ')

/** The bar of a pair's km against its limit; red from 90% on. */
function WearBar({ state }: { state: GearStatus }) {
  return (
    <div
      role="meter"
      aria-label={`${state.gear.name}: quilometragem`}
      aria-valuemin={0}
      aria-valuemax={state.limitKm}
      aria-valuenow={Math.round(state.km)}
      className="h-3 overflow-hidden rounded-full bg-surface-2"
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-700 ease-out', state.warn ? 'bg-critical' : 'bg-(--tone-today)')}
        style={{ width: `${Math.min(state.share, 1) * 100}%` }}
      />
    </div>
  )
}

function GearCard({ state, onEdit, onRetire }: { state: GearStatus; onEdit: () => void; onRetire: () => void }) {
  const { gear } = state
  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{gear.name}</h2>
          <p className="text-xs text-muted">
            {gear.defaultFor?.length ? `Padrão nas ${usesText(gear.defaultFor)}` : 'Sem uso padrão'}
            {gear.since && ` · em uso desde ${formatDay(gear.since, 'd/MM/yy')}`}
          </p>
        </div>
        <div className="flex shrink-0">
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Editar ${gear.name}`} title="Editar">
            <Pencil size={16} />
          </Button>
          <Button size="sm" variant="ghost" onClick={onRetire} aria-label={`Aposentar ${gear.name}`} title="Aposentar">
            <Archive size={16} />
          </Button>
        </div>
      </div>
      <p className="mb-2 text-sm text-ink-2">
        <span className="text-2xl font-semibold text-ink tabular-nums">{formatNumber(state.km, 0)} km</span> de{' '}
        {formatNumber(state.limitKm, 0)} · {state.activities === 1 ? '1 atividade' : `${state.activities} atividades`}
      </p>
      <WearBar state={state} />
      {state.warn && <GearAlert state={state} className="mt-3" />}
    </Card>
  )
}

/** Adding or changing a pair; "usar nas corridas desde" puts it on the activities without shoes since that day. */
function GearForm({ gear, activities, today, onClose }: { gear?: Gear; activities: Activity[]; today: DayKey; onClose: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(gear?.name ?? '')
  const [startKm, setStartKm] = useState(gear?.startKm ? String(gear.startKm).replace('.', ',') : '')
  const [limitKm, setLimitKm] = useState(String(gear?.limitKm ?? DEFAULT_LIMIT_KM))
  const [uses, setUses] = useState<GearUse[]>(() => (gear ? ((gear.defaultFor ?? []) as GearUse[]) : ['run']))
  // New pairs start ready to take the last month's runs; a pair being edited, only when asked.
  const [fill, setFill] = useState(!gear)
  const [since, setSince] = useState<DayKey>(() => gear?.since ?? shiftDay(today, -30))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fillUses: GearUse[] = uses.length > 0 ? uses : ['run']
  const fillWords = usesText(fillUses)
  const pending = withoutGear(activities, fillUses, since).length
  const limit = parseDecimal(limitKm)
  const start = parseDecimal(startKm)
  const valid = name.trim() !== '' && limit !== undefined && limit > 0 && (start === undefined || start >= 0) && (!fill || since <= today)

  const toggleUse = (use: GearUse) => setUses((current) => (current.includes(use) ? current.filter((u) => u !== use) : [...current, use]))

  async function submit() {
    if (!valid) return
    // The day it went into use: the first day it fills, or today for a new pair without it.
    const inUse = fill ? (gear?.since && gear.since < since ? gear.since : since) : (gear?.since ?? today)
    const row = await saveGear({
      ...(gear && { id: gear.id, retired: gear.retired }),
      kind: 'shoe',
      name: name.trim(),
      ...(start ? { startKm: start } : {}),
      limitKm: limit!,
      defaultFor: uses,
      since: inUse,
    })
    const filled = fill ? await fillGear(row.id, fillUses, since) : 0
    toast({ message: filled > 0 ? `${row.name} salvo e usado em ${filled === 1 ? '1 atividade' : `${filled} atividades`}.` : `${row.name} salvo.` })
    onClose()
  }

  return (
    <Modal open title={gear ? 'Editar tênis' : 'Novo tênis'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label="Nome">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Pegasus 41 azul" maxLength={60} autoFocus={!gear} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Km que já tinha" hint={fill ? `Antes de ${formatDay(since, 'd/MM')}` : 'Antes de entrar no app'}>
            <DecimalInput value={startKm} onChange={(event) => setStartKm(event.target.value)} placeholder="0" />
          </Field>
          <Field label="Trocar com (km)" hint="O comum é entre 500 e 800">
            <DecimalInput value={limitKm} onChange={(event) => setLimitKm(event.target.value)} />
          </Field>
        </div>
        <Field label="Padrão para" hint="As novas atividades desse tipo já vêm com este par." group>
          <div className="flex gap-2">
            {GEAR_USES.map(({ use, label }) => (
              <button
                key={use}
                type="button"
                aria-pressed={uses.includes(use)}
                onClick={() => toggleUse(use)}
                className={cx(
                  'h-9 rounded-full border px-3 text-sm transition',
                  uses.includes(use) ? 'border-accent-ink bg-accent/15 text-ink' : 'border-line text-ink-2 hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Usar nas {fillWords} desde</span>
            <Switch checked={fill} onChange={setFill} label={`Usar nas ${fillWords} sem tênis desde uma data`} />
          </div>
          {fill && (
            <>
              <TextInput type="date" className="mt-2" value={since} max={today} onChange={(event) => event.target.value && setSince(event.target.value)} />
              <p className="mt-1 text-xs text-muted">
                {pending === 0
                  ? `Nenhuma das ${fillWords} desde ${formatDay(since, 'd/MM')} está sem tênis.`
                  : `${pending === 1 ? '1 atividade sem tênis desde essa data vai' : `${pending} atividades sem tênis desde essa data vão`} usar este par.`}
              </p>
            </>
          )}
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={!valid}>
          Salvar
        </Button>
        {gear && (
          <Button variant="ghost" className="w-full text-critical" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Excluir tênis
          </Button>
        )}
      </form>
      {confirmDelete && gear && (
        <Confirm
          title="Excluir tênis?"
          message="As atividades feitas com ele ficam sem tênis. Para guardar a quilometragem, aposente em vez de excluir."
          confirmLabel="Excluir"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => void deleteGear(gear.id).then(onClose)}
        />
      )}
    </Modal>
  )
}

/**
 * "Tênis": each pair with its km (what it had when added plus the activities done in it) against
 * when to replace it, warning from 90% on; add, edit and retire pairs.
 */
export default function GearPage() {
  const gear = useGear()
  const activities = useActivities()
  const today = useToday()
  const toast = useToast()
  const [editing, setEditing] = useState<Gear | 'new'>()
  useNewFromLink('tenis', () => setEditing('new'))
  const states = useMemo(() => (gear && activities ? gearStatus(gear, activities) : undefined), [gear, activities])

  const page = { title: 'Tênis', icon: SportShoe, tone: 'today' as const, back: { to: '/corrida', label: 'Corrida' } }
  if (!states || !activities) {
    return (
      <Page {...page}>
        <SkeletonCard lines={3} />
      </Page>
    )
  }

  const byUse = (state: GearStatus) => -(state.gear.defaultFor?.length ?? 0)
  const active = states.filter((state) => !state.gear.retired).sort((a, b) => byUse(a) - byUse(b) || b.km - a.km)
  const retired = states.filter((state) => state.gear.retired).sort((a, b) => b.km - a.km)

  const retire = (state: GearStatus) => {
    void setRetired(state.gear.id, true)
    toast({ message: `${state.gear.name} aposentado.`, action: { label: 'Desfazer', onClick: () => void saveGear({ ...state.gear, retired: 0 }) } })
  }

  return (
    <Page
      {...page}
      subtitle="A quilometragem de cada par"
      actions={
        <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
          <Plus size={16} /> Adicionar
        </Button>
      }
    >
      {active.length === 0 && (
        <Card>
          <Empty>Nenhum tênis em uso. Adicione o par que você usa nas corridas para acompanhar o desgaste.</Empty>
        </Card>
      )}
      {active.map((state) => (
        <GearCard key={state.gear.id} state={state} onEdit={() => setEditing(state.gear)} onRetire={() => retire(state)} />
      ))}

      {retired.length > 0 && (
        <Card title="Aposentados">
          <ul className="divide-y divide-line">
            {retired.map((state) => (
              <li key={state.gear.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{state.gear.name}</span>
                  <span className="block text-xs text-muted">
                    {formatNumber(state.km, 0)} km · {state.activities === 1 ? '1 atividade' : `${state.activities} atividades`}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => void setRetired(state.gear.id, false)}>
                  <RotateCcw size={14} /> Voltar a usar
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editing && (
        <GearForm gear={editing === 'new' ? undefined : editing} activities={activities} today={today} onClose={() => setEditing(undefined)} />
      )}
    </Page>
  )
}
