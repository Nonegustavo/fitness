import { GlassWater, Plus, Star, Target, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { DayNav, DayPager } from '../../components/DayNav'
import { Modal } from '../../components/Modal'
import { PeriodBars } from '../../components/PeriodBars'
import { PeriodControl, useFirstDay, usePeriod, type Period } from '../../components/PeriodControl'
import { SortableList } from '../../components/Sortable'
import { useRemoveWithUndo } from '../../components/SwipeToDelete'
import { toneColor } from '../../components/tone'
import { Button, Card, cx, DecimalInput, Empty, Field, IconButton, Page, SkeletonLines, TextInput } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import { patch, save, saveOrder } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { ContainerIcon, WaterContainer, WaterLog } from '../../db/types'
import { formatDay, formatTime, type DayKey } from '../../lib/dates'
import { formatMl, formatNumber, parseDecimal } from '../../lib/format'
import type { DayValue } from '../../lib/stats'
import { useWeights } from '../body/body'
import { CONTAINER_ICONS } from './containerIcons'
import { changeWater, CLOCK, suggestedGoalMl, sumMl, useContainers, useWaterLogs, waterAmountProblem } from './water'
import { WaterQuickAdd, WaterSummary } from './WaterQuickAdd'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** What a log was drunk from: its container, or "Outro valor" (a custom amount, or a container since deleted). */
const containerOf = (containers: WaterContainer[], log: WaterLog) =>
  containers.find((container) => container.id === log.containerId)

export default function WaterPage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  // The day lives in the address (?data=), so going back returns to it and the "+" adds on it.
  const asked = params.get('data')
  const date = asked && DAY.test(asked) && asked <= today ? asked : today
  const setDate = (next: DayKey) => setParams(next === today ? {} : { data: next }, { replace: true })
  const settings = useSettings()
  const containers = useContainers() ?? []
  const history = useWaterHistory()
  const [goalOpen, setGoalOpen] = useState(false)
  const [editing, setEditing] = useState<WaterContainer | 'new' | null>(null)
  const [entry, setEntry] = useState<WaterLog | null>(null)

  return (
    <Page
      title="Água"
      icon={GlassWater}
      tone="water"
      actions={
        <Button size="sm" variant="ghost" onClick={() => setGoalOpen(true)}>
          <Target size={16} /> Meta
        </Button>
      }
    >
      {/* All of the screen is the day's page: dragged sideways, everything moves with the finger. */}
      <DayPager date={date} today={today} onChange={setDate} className="space-y-4">
        {(day) => (
          <>
            <WaterDay
              date={day}
              today={today}
              goalMl={settings.waterGoalMl}
              containers={containers}
              onDate={setDate}
              onEdit={setEntry}
            />
            <Card title="Histórico">
              <WaterHistory history={history} today={today} goalMl={settings.waterGoalMl} />
            </Card>
            <ContainersCard containers={containers} onEdit={setEditing} />
          </>
        )}
      </DayPager>

      {goalOpen && <GoalModal goalMl={settings.waterGoalMl} onClose={() => setGoalOpen(false)} />}
      {editing && (
        <ContainerModal
          container={editing === 'new' ? null : editing}
          nextOrder={containers.length ? Math.max(...containers.map((c) => c.order)) + 1 : 0}
          onClose={() => setEditing(null)}
        />
      )}
      {entry && (
        <EntryModal log={entry} name={containerOf(containers, entry)?.name ?? 'Outro valor'} onClose={() => setEntry(null)} />
      )}
    </Page>
  )
}

/** One day: its water against the goal, the buttons to add on it, and what was drunk, at what time. */
function WaterDay({
  date,
  today,
  goalMl,
  containers,
  onDate,
  onEdit,
}: {
  date: DayKey
  today: DayKey
  goalMl: number
  containers: WaterContainer[]
  onDate: (date: DayKey) => void
  onEdit: (log: WaterLog) => void
}) {
  const logs = useWaterLogs(date, date)
  const removeWithUndo = useRemoveWithUndo()
  const past = date !== today

  return (
    <>
      <Card>
        <DayNav date={date} today={today} onChange={onDate} />
        {logs ? <WaterSummary totalMl={sumMl(logs)} goalMl={goalMl} past={past} /> : <SkeletonLines lines={2} />}
        <div className="mt-4">
          <WaterQuickAdd date={date} />
        </div>
        {past && <p className="mt-2 text-xs text-muted">Neste dia, a água entra com a hora de agora. Para mudar, toque no registro.</p>}
      </Card>

      <Card title={past ? 'Registros do dia' : 'Registros de hoje'}>
        {!logs ? (
          <SkeletonLines lines={3} />
        ) : logs.length === 0 ? (
          <Empty>{past ? 'Nada registrado neste dia.' : 'Nada registrado hoje.'}</Empty>
        ) : (
          <>
            {/* No swipe to delete here: a sideways drag changes the day. */}
            <ul className="divide-y divide-line">
              {[...logs].reverse().map((log) => {
                const container = containerOf(containers, log)
                const Icon = container ? CONTAINER_ICONS[container.icon].icon : GlassWater
                const name = container?.name ?? 'Outro valor'
                return (
                  <li key={log.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(log)}
                      aria-label={`${name}, ${formatMl(log.ml)} às ${formatTime(log.time)}: mudar a hora ou a quantidade`}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-1.5 text-left"
                    >
                      <span className="w-11 shrink-0 text-sm text-ink-2 tabular-nums">{formatTime(log.time)}</span>
                      <Icon size={18} aria-hidden className="shrink-0" style={{ color: toneColor('water') }} />
                      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">{formatMl(log.ml)}</span>
                    </button>
                    <IconButton
                      label="Apagar registro"
                      onClick={() => removeWithUndo(db.waterLogs, log.id, `Registro de ${formatMl(log.ml)} apagado`)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-xs text-muted">Toque num registro para mudar a hora ou a quantidade.</p>
          </>
        )}
      </Card>
    </>
  )
}

/** A log's time and amount, or removing it. The time stays on the log's own day. */
function EntryModal({ log, name, onClose }: { log: WaterLog; name: string; onClose: () => void }) {
  const removeWithUndo = useRemoveWithUndo()
  const [clock, setClock] = useState(formatTime(log.time))
  const [mlText, setMlText] = useState(String(log.ml))
  const ml = parseDecimal(mlText)
  const amountProblem = waterAmountProblem(mlText)
  const valid = CLOCK.test(clock) && ml !== undefined && !amountProblem

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    await changeWater(log, clock, Math.round(ml))
    onClose()
  }

  return (
    <Modal open title={name} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-2 first-letter:uppercase">{formatDay(log.date)}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hora" hint={!CLOCK.test(clock) && <span className="text-critical">Escolha a hora.</span>}>
            <TextInput type="time" value={clock} onChange={(e) => setClock(e.target.value)} />
          </Field>
          <Field label="Quantidade (ml)" hint={amountProblem && <span className="text-critical">{amountProblem}</span>}>
            <DecimalInput value={mlText} onChange={(e) => setMlText(e.target.value)} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={() => {
              removeWithUndo(db.waterLogs, log.id, `Registro de ${formatMl(log.ml)} apagado`)
              onClose()
            }}
          >
            <Trash2 size={16} /> Apagar
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!valid}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

const litersAxis = (value: number) => (value === 0 ? '0' : `${formatNumber(value / 1000)} L`)

interface WaterHistoryData {
  period: Period
  /** Undefined while the logs load. */
  values?: DayValue[]
}

/**
 * The history's period and logs, read once for the screen: each day's page draws the same chart, so
 * the one coming in during a drag shows it at once, with the period picked.
 */
function useWaterHistory(): WaterHistoryData {
  const earliest = useFirstDay(db.waterLogs, 'date')
  const period = usePeriod('agua', { earliest })
  const logs = useWaterLogs(period.window.from, period.window.to)
  const values = useMemo(() => logs?.map((log) => ({ date: log.date, value: log.ml })), [logs])
  return { period, values }
}

/** Water over the period picked: each day, or the average per day of a week, month or year. */
function WaterHistory({ history, today, goalMl }: { history: WaterHistoryData; today: DayKey; goalMl: number }) {
  const { period, values } = history
  return (
    <>
      <PeriodControl period={period} />
      {values ? (
        <PeriodBars
          periods={period.window}
          values={values}
          how="perDay"
          unfinished={today}
          goal={goalMl}
          format={formatMl}
          axisFormat={litersAxis}
          valueLabel="de água"
          label="Água bebida por dia"
          step={500}
        />
      ) : (
        <SkeletonLines lines={5} />
      )}
    </>
  )
}

function ContainersCard({ containers, onEdit }: { containers: WaterContainer[]; onEdit: (container: WaterContainer | 'new') => void }) {
  return (
    <Card
      title="Recipientes"
      action={
        <Button size="sm" onClick={() => onEdit('new')}>
          <Plus size={16} /> Novo
        </Button>
      }
    >
      <p className="mb-2 text-xs text-muted">Os favoritos (estrela) viram botões de 1 toque.</p>
      <SortableList
        className="divide-y divide-line"
        itemClassName="flex items-center gap-2 bg-surface py-1.5"
        items={containers}
        getId={(container) => container.id}
        onReorder={(list) => void saveOrder(db.waterContainers, list)}
      >
        {(container, handle) => {
          const Icon = CONTAINER_ICONS[container.icon].icon
          const favorite = container.favorite === 1
          return (
            <>
              <span className="-ml-2 flex">{handle}</span>
              <button
                type="button"
                onClick={() => onEdit(container)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left hover:text-accent-ink"
              >
                <Icon size={20} className="shrink-0 text-ink-2" />
                <span className="flex-1 truncate text-sm">{container.name}</span>
                <span className="text-sm text-ink-2 tabular-nums">{formatMl(container.ml)}</span>
              </button>
              <IconButton
                label={favorite ? 'Tirar dos favoritos' : 'Favoritar'}
                aria-pressed={favorite}
                onClick={() => void patch(db.waterContainers, container.id, { favorite: favorite ? 0 : 1 })}
              >
                <Star size={18} className={cx(favorite && 'fill-current text-accent-ink')} />
              </IconButton>
            </>
          )
        }}
      </SortableList>
    </Card>
  )
}

function GoalModal({ goalMl, onClose }: { goalMl: number; onClose: () => void }) {
  const [text, setText] = useState(String(goalMl))
  const latestWeight = useWeights()?.at(-1)
  const value = parseDecimal(text)
  const valid = value !== undefined && value >= 500 && value <= 10000
  const suggestion = latestWeight ? suggestedGoalMl(latestWeight.weightKg) : undefined

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    await patch(db.settings, SETTINGS_ID, { waterGoalMl: Math.round(value) })
    onClose()
  }

  return (
    <Modal open title="Meta diária de água" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Meta (ml)">
          <DecimalInput autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {suggestion !== undefined && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3 text-sm">
            <span className="text-ink-2">
              Pelo seu peso ({formatNumber(latestWeight!.weightKg)} kg × 35 ml): <strong className="text-ink">{formatMl(suggestion)}</strong>
            </span>
            <Button size="sm" onClick={() => setText(String(suggestion))}>
              Usar
            </Button>
          </div>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={!valid}>
          Salvar
        </Button>
      </form>
    </Modal>
  )
}

function ContainerModal({
  container,
  nextOrder,
  onClose,
}: {
  container: WaterContainer | null
  nextOrder: number
  onClose: () => void
}) {
  const [name, setName] = useState(container?.name ?? '')
  const [mlText, setMlText] = useState(container ? String(container.ml) : '')
  const [icon, setIcon] = useState<ContainerIcon>(container?.icon ?? 'glass')
  const [favorite, setFavorite] = useState(container ? container.favorite === 1 : true)
  const removeWithUndo = useRemoveWithUndo()
  const ml = parseDecimal(mlText)
  const valid = name.trim() !== '' && ml !== undefined && ml >= 10 && ml <= 5000

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    await save(db.waterContainers, {
      id: container?.id,
      name: name.trim(),
      ml: Math.round(ml),
      icon,
      favorite: favorite ? 1 : 0,
      order: container?.order ?? nextOrder,
    })
    onClose()
  }

  function onDelete() {
    if (!container) return
    removeWithUndo(db.waterContainers, container.id, 'Recipiente apagado')
    onClose()
  }

  return (
    <Modal open title={container ? 'Editar recipiente' : 'Novo recipiente'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Garrafa da academia" />
        </Field>
        <Field label="Volume (ml)">
          <DecimalInput value={mlText} onChange={(e) => setMlText(e.target.value)} placeholder="Ex.: 750" />
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-2">Ícone</legend>
          <div className="flex gap-2">
            {(Object.keys(CONTAINER_ICONS) as ContainerIcon[]).map((key) => {
              const { icon: Icon, label } = CONTAINER_ICONS[key]
              return (
                <IconButton
                  key={key}
                  label={label}
                  aria-pressed={icon === key}
                  onClick={() => setIcon(key)}
                  className={cx('size-12 border', icon === key ? 'border-accent-ink text-ink' : 'border-line')}
                >
                  <Icon size={22} />
                </IconButton>
              )
            })}
          </div>
        </fieldset>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
            className="size-5 accent-(--accent)"
          />
          Favorito (botão de 1 toque)
        </label>
        <div className="flex gap-2">
          {container && (
            <Button variant="danger" onClick={onDelete}>
              <Trash2 size={16} /> Apagar
            </Button>
          )}
          <Button type="submit" variant="primary" className="flex-1" disabled={!valid}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
