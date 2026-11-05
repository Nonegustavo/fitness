import { GlassWater, Plus, Star, Target, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { PeriodBars } from '../../components/PeriodBars'
import { PeriodControl, useFirstDay, usePeriod } from '../../components/PeriodControl'
import { SortableList } from '../../components/Sortable'
import { SwipeToDelete, useRemoveWithUndo } from '../../components/SwipeToDelete'
import { Button, Card, cx, DecimalInput, Empty, Field, IconButton, Page, SkeletonLines, TextInput } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import { patch, remove, save, saveOrder } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { ContainerIcon, WaterContainer } from '../../db/types'
import { formatDay, formatTime, type DayKey } from '../../lib/dates'
import { formatMl, formatNumber, parseDecimal } from '../../lib/format'
import { useWeights } from '../body/body'
import { CONTAINER_ICONS } from './containerIcons'
import { suggestedGoalMl, sumMl, useContainers, useWaterLogs } from './water'
import { WaterQuickAdd, WaterSummary } from './WaterQuickAdd'

export default function WaterPage() {
  const today = useToday()
  const settings = useSettings()
  const logs = useWaterLogs(today, today)
  const containers = useContainers() ?? []
  const [goalOpen, setGoalOpen] = useState(false)
  const [editing, setEditing] = useState<WaterContainer | 'new' | null>(null)
  const removeWithUndo = useRemoveWithUndo()

  const todayLogs = logs ?? []
  const containerName = (id?: string) => containers.find((container) => container.id === id)?.name

  return (
    <Page title="Água" icon={GlassWater} tone="water" subtitle={formatDay(today)}>
      <Card
        title="Hoje"
        action={
          <Button size="sm" variant="ghost" onClick={() => setGoalOpen(true)}>
            <Target size={16} /> Meta
          </Button>
        }
      >
        <WaterSummary totalMl={sumMl(todayLogs)} goalMl={settings.waterGoalMl} />
        <div className="mt-4">
          <WaterQuickAdd />
        </div>
      </Card>

      <Card title="Registros de hoje">
        {todayLogs.length === 0 ? (
          <Empty>Nada registrado hoje.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {[...todayLogs].reverse().map((log) => {
              const onDelete = () => removeWithUndo(db.waterLogs, log.id, `Registro de ${formatMl(log.ml)} apagado`)
              return (
                <SwipeToDelete key={log.id} onDelete={onDelete}>
                  <div className="flex items-center gap-3 py-1.5">
                    <span className="w-12 text-sm text-ink-2 tabular-nums">{formatTime(log.time)}</span>
                    <span className="flex-1 truncate text-sm">{containerName(log.containerId) ?? 'Outro valor'}</span>
                    <span className="text-sm font-medium tabular-nums">{formatMl(log.ml)}</span>
                    <IconButton label="Apagar registro" onClick={onDelete}>
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </SwipeToDelete>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="Histórico">
        <WaterHistory today={today} goalMl={settings.waterGoalMl} />
      </Card>

      <Card
        title="Recipientes"
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
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
                  onClick={() => setEditing(container)}
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

      {goalOpen && <GoalModal goalMl={settings.waterGoalMl} onClose={() => setGoalOpen(false)} />}
      {editing && (
        <ContainerModal
          container={editing === 'new' ? null : editing}
          nextOrder={containers.length ? Math.max(...containers.map((c) => c.order)) + 1 : 0}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  )
}

const litersAxis = (value: number) => (value === 0 ? '0' : `${formatNumber(value / 1000)} L`)

/** Water over the period picked: each day, or the average per day of a week, month or year. */
function WaterHistory({ today, goalMl }: { today: DayKey; goalMl: number }) {
  const earliest = useFirstDay(db.waterLogs, 'date')
  const period = usePeriod('agua', { earliest })
  const logs = useWaterLogs(period.window.from, period.window.to)
  const values = useMemo(() => (logs ?? []).map((log) => ({ date: log.date, value: log.ml })), [logs])
  return (
    <>
      <PeriodControl period={period} />
      {logs ? (
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

  async function onDelete() {
    if (!container) return
    await remove(db.waterContainers, container.id)
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
            <Button variant="danger" onClick={() => void onDelete()}>
              <Trash2 size={16} /> Excluir
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
