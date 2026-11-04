import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ImageIcon, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, Card, cx, Empty, Field, Segmented, Select } from '../../components/ui'
import { useToday } from '../../db/hooks'
import { alive, remove, save } from '../../db/repo'
import { db } from '../../db/schema'
import type { Pose, ProgressPhoto } from '../../db/types'
import { daysBetween, formatDay, type DayKey } from '../../lib/dates'
import { formatFixed, formatSigned } from '../../lib/format'
import { keepPhoto, usePhotoUrl } from '../food/photos'
import { metricSeries, useWeights } from './body'

const POSES: { value: Pose; label: string }[] = [
  { value: 'front', label: 'Frente' },
  { value: 'side', label: 'Lado' },
  { value: 'back', label: 'Costas' },
]
const POSE_LABEL = Object.fromEntries(POSES.map((p) => [p.value, p.label])) as Record<Pose, string>

function useProgressPhotos(): ProgressPhoto[] | undefined {
  return useLiveQuery(async () => alive(await db.progressPhotos.toArray()).sort((a, b) => a.time - b.time))
}

/** The weight trend on a day (or the closest day before it), to put next to a photo. */
function useTrendOn(): (date: DayKey) => number | undefined {
  const weights = useWeights()
  return useMemo(() => {
    const { trend } = metricSeries(weights ?? [], (entry) => entry.weightKg)
    return (date: DayKey) => [...trend].reverse().find((point) => point.date <= date)?.value
  }, [weights])
}

/** Body photos by pose, and two dates side by side to see the change. */
export function ProgressPhotos() {
  const today = useToday()
  const toast = useToast()
  const photos = useProgressPhotos()
  const trendOn = useTrendOn()
  const input = useRef<HTMLInputElement>(null)
  const [pose, setPose] = useState<Pose>('front')
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null)

  const ofPose = (photos ?? []).filter((photo) => photo.pose === pose)
  const dates = [...new Set(ofPose.map((photo) => photo.date))]
  const [beforeDate, setBeforeDate] = useState<DayKey>()
  const [afterDate, setAfterDate] = useState<DayKey>()
  const before = ofPose.find((p) => p.date === (beforeDate && dates.includes(beforeDate) ? beforeDate : dates[0]))
  const after = ofPose.findLast((p) => p.date === (afterDate && dates.includes(afterDate) ? afterDate : dates.at(-1)))

  async function add(file: File) {
    const photoId = await keepPhoto(file)
    await save(db.progressPhotos, { date: today, time: Date.now(), pose, photoId })
    toast({ message: `Foto de ${POSE_LABEL[pose].toLowerCase()} guardada` })
  }

  if (!photos) return null
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented label="Pose" value={pose} onChange={setPose} options={POSES} />
          <Button variant="primary" onClick={() => input.current?.click()}>
            <Camera size={18} /> Foto de {POSE_LABEL[pose].toLowerCase()}
          </Button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void add(file)
              event.target.value = ''
            }}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Mesma luz, mesmo lugar e de manhã, antes de comer: assim as fotos ficam comparáveis. A cada 2–4 semanas basta.
        </p>
      </Card>

      {dates.length >= 2 && before && after && (
        <Card title="Comparar">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Field label="Antes">
              <Select value={before.date} onChange={(e) => setBeforeDate(e.target.value)}>
                {dates.map((date) => (
                  <option key={date} value={date}>
                    {formatDay(date, 'd/M/yyyy')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Depois">
              <Select value={after.date} onChange={(e) => setAfterDate(e.target.value)}>
                {dates.map((date) => (
                  <option key={date} value={date}>
                    {formatDay(date, 'd/M/yyyy')}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[before, after].map((photo) => (
              <PhotoTile key={photo.id} photo={photo} weight={trendOn(photo.date)} onOpen={() => setViewing(photo)} tall />
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-ink-2">
            {daysBetween(before.date, after.date)} dias
            {trendOn(before.date) !== undefined && trendOn(after.date) !== undefined &&
              ` · ${formatSigned(trendOn(after.date)! - trendOn(before.date)!)} kg pela tendência`}
          </p>
        </Card>
      )}

      <Card title={`${POSE_LABEL[pose]} · ${ofPose.length} ${ofPose.length === 1 ? 'foto' : 'fotos'}`}>
        {ofPose.length === 0 ? (
          <Empty>Nenhuma foto de {POSE_LABEL[pose].toLowerCase()} ainda.</Empty>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {[...ofPose].reverse().map((photo) => (
              <PhotoTile key={photo.id} photo={photo} weight={trendOn(photo.date)} onOpen={() => setViewing(photo)} />
            ))}
          </div>
        )}
      </Card>

      {viewing && <PhotoModal photo={viewing} weight={trendOn(viewing.date)} onClose={() => setViewing(null)} />}
    </>
  )
}

function PhotoTile({
  photo,
  weight,
  onOpen,
  tall,
}: {
  photo: ProgressPhoto
  weight?: number
  onOpen: () => void
  tall?: boolean
}) {
  const url = usePhotoUrl(photo.photoId)
  return (
    <button type="button" onClick={onOpen} className="min-w-0 text-left">
      <span
        className={cx(
          'flex w-full items-center justify-center overflow-hidden rounded-xl bg-surface-2',
          tall ? 'aspect-[3/4]' : 'aspect-square',
        )}
      >
        {url ? <img src={url} alt="" className="size-full object-cover" /> : <ImageIcon size={20} className="text-muted" />}
      </span>
      <span className="mt-1 block truncate text-xs text-ink-2">
        {formatDay(photo.date, 'd/M/yy')}
        {weight !== undefined && ` · ${formatFixed(weight)} kg`}
      </span>
    </button>
  )
}

function PhotoModal({ photo, weight, onClose }: { photo: ProgressPhoto; weight?: number; onClose: () => void }) {
  const url = usePhotoUrl(photo.photoId)
  return (
    <Modal
      open
      title={`${POSE_LABEL[photo.pose]} · ${formatDay(photo.date, "d 'de' MMMM 'de' yyyy")}`}
      onClose={onClose}
    >
      {url && <img src={url} alt={`Foto de ${POSE_LABEL[photo.pose].toLowerCase()}`} className="w-full rounded-xl" />}
      {weight !== undefined && <p className="mt-2 text-sm text-ink-2">Peso pela tendência: {formatFixed(weight)} kg</p>}
      <Button
        variant="danger"
        className="mt-4"
        onClick={() => {
          void remove(db.progressPhotos, photo.id)
          onClose()
        }}
      >
        <Trash2 size={16} /> Apagar
      </Button>
    </Modal>
  )
}
