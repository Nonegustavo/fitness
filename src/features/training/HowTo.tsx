import { Check, ImageOff, ImagePlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'
import { Button, Card, cx, SkeletonLines, TextInput } from '../../components/ui'
import { patch } from '../../db/repo'
import { db } from '../../db/schema'
import type { Exercise } from '../../db/types'
import {
  loadMediaEntry,
  loadMediaIndex,
  MEDIA_HOME,
  mediaDetail,
  mediaIdOf,
  mediaImage,
  mediaImages,
  noMedia,
  searchMedia,
} from './exerciseMedia'
import { STEPS_PT } from './exerciseSteps'

type Loaded<T> = { status: 'loading' } | { status: 'done'; value: T } | { status: 'failed' }

/** Something fetched for a key (none: nothing to fetch), with a retry after a failure (offline). */
function useLoad<T>(key: string | undefined, load: (key: string) => Promise<T>): [Loaded<T>, () => void] {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; attempt: number; loaded: Loaded<T> }>()
  useEffect(() => {
    if (key === undefined) return
    let live = true
    load(key).then(
      (value) => live && setResult({ key, attempt, loaded: { status: 'done', value } }),
      () => live && setResult({ key, attempt, loaded: { status: 'failed' } }),
    )
    return () => {
      live = false
    }
  }, [key, attempt, load])
  const loaded: Loaded<T> = result && result.key === key && result.attempt === attempt ? result.loaded : { status: 'loading' }
  return [loaded, () => setAttempt((n) => n + 1)]
}

/** The exercise's first picture, small; a blank tile without one (or offline), so names stay aligned. */
export function MediaThumb({ src, className }: { src: string | undefined; className?: string }) {
  const [failed, setFailed] = useState<string>()
  if (!src || failed === src) return <span aria-hidden className={cx('shrink-0 rounded-lg bg-surface-2', className)} />
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(src)}
      className={cx('shrink-0 rounded-lg bg-surface-2 object-cover', className)}
    />
  )
}

function MediaPicture({ src, caption }: { src: string; caption: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <figure className="min-w-0">
      {failed ? (
        <div className="flex aspect-[3/2] flex-col items-center justify-center gap-1 rounded-xl bg-surface-2 text-xs text-muted">
          <ImageOff size={20} aria-hidden /> Foto indisponível
        </div>
      ) : (
        <img
          src={src}
          alt={`${caption} do movimento`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="aspect-[3/2] w-full rounded-xl bg-surface-2 object-cover"
        />
      )}
      <figcaption className="mt-1 text-center text-xs text-muted">{caption}</figcaption>
    </figure>
  )
}

function Attribution() {
  return (
    <p className="text-xs text-muted">
      Fotos e instruções:{' '}
      <a href={MEDIA_HOME} target="_blank" rel="noreferrer" className="underline hover:text-ink">
        free-exercise-db
      </a>
    </p>
  )
}

function Steps({ steps, lang }: { steps: string[]; lang?: string }) {
  return (
    <ol lang={lang} className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink-2 marker:text-muted">
      {steps.map((step, i) => (
        <li key={i}>{step}</li>
      ))}
    </ol>
  )
}

/**
 * How to do the exercise: the start and end pictures and the steps, in Portuguese for the default
 * library and in the dataset's English otherwise. Without them, a way to link them.
 */
export function HowToCard({ exercise }: { exercise: Exercise }) {
  const [picking, setPicking] = useState(false)
  const mediaId = mediaIdOf(exercise)
  const stepsPt = mediaId ? STEPS_PT[mediaId] : undefined
  const [english, retry] = useLoad(mediaId && !stepsPt ? mediaId : undefined, loadMediaEntry)

  return (
    <Card
      title="Como fazer"
      action={
        mediaId && (
          <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
            Trocar fotos
          </Button>
        )
      }
    >
      {mediaId ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {mediaImages(mediaId).map((src, i) => (
              <MediaPicture key={src} src={src} caption={i === 0 ? 'Início' : 'Fim'} />
            ))}
          </div>
          {stepsPt ? (
            <Steps steps={stepsPt} />
          ) : english.status === 'done' ? (
            <>
              <p className="mt-3 text-xs font-medium text-muted">Passo a passo em inglês</p>
              <Steps steps={english.value.instructions} lang="en" />
            </>
          ) : english.status === 'loading' ? (
            <div className="mt-3">
              <SkeletonLines lines={3} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-2">
              Sem conexão para o passo a passo.{' '}
              <button type="button" onClick={retry} className="font-medium text-accent-ink">
                Tentar de novo
              </button>
            </p>
          )}
          <div className="mt-3">
            <Attribution />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink-2">Este exercício ainda não tem fotos nem passo a passo.</p>
          <Button onClick={() => setPicking(true)}>
            <ImagePlus size={18} /> Vincular fotos
          </Button>
        </div>
      )}
      {picking && (
        <MediaPicker
          query={exercise.name}
          current={mediaId}
          onClose={() => setPicking(false)}
          onPick={(next) => void patch(db.exercises, exercise.id, { mediaId: next ?? noMedia(exercise.id) })}
        />
      )}
    </Card>
  )
}

/**
 * The free-exercise-db exercise with the same movement, searched by name (Portuguese or English): its
 * pictures and steps go with the exercise. Undefined takes them off.
 */
export function MediaPicker({
  query: initialQuery,
  current,
  onPick,
  onClose,
}: {
  /** The exercise's name, to start from. */
  query: string
  current: string | undefined
  onPick: (mediaId: string | undefined) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [index, retry] = useLoad('index', loadMediaIndex)
  const results = index.status === 'done' ? searchMedia(index.value, query) : []
  const pick = (mediaId: string | undefined) => {
    onPick(mediaId)
    onClose()
  }

  return (
    <Modal open title="Vincular fotos" onClose={onClose}>
      <TextInput
        type="search"
        placeholder="Nome do exercício, em português ou inglês"
        aria-label="Buscar na base de exercícios"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="mt-2 text-xs text-muted">Escolha o mesmo movimento: as fotos e o passo a passo dele vão para o exercício.</p>
      {index.status === 'loading' && (
        <div className="mt-3">
          <SkeletonLines lines={4} />
        </div>
      )}
      {index.status === 'failed' && (
        <p className="mt-3 text-sm text-ink-2">
          Não foi possível carregar a base de exercícios (sem internet?).{' '}
          <button type="button" onClick={retry} className="font-medium text-accent-ink">
            Tentar de novo
          </button>
        </p>
      )}
      {index.status === 'done' && (
        <ul className="mt-2 max-h-[50dvh] divide-y divide-line overflow-y-auto">
          {results.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => pick(entry.id)}
                aria-current={entry.id === current || undefined}
                className="flex w-full items-center gap-3 py-2 text-left hover:text-accent-ink"
              >
                <MediaThumb src={entry.images[0] ? mediaImage(entry.images[0]) : undefined} className="h-10 w-14" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{entry.name}</span>
                  <span className="block truncate text-xs text-muted">{mediaDetail(entry)}</span>
                </span>
                {entry.id === current && <Check size={18} aria-hidden className="shrink-0 text-accent-ink" />}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="py-6 text-center text-sm text-muted">
              {query.trim() ? 'Nada encontrado. Tente em inglês, como "bench press".' : 'Busque pelo nome do exercício.'}
            </li>
          )}
        </ul>
      )}
      <div className="mt-3 flex min-h-9 items-center justify-between gap-2">
        <Attribution />
        {current && (
          <Button size="sm" variant="ghost" className="text-critical" onClick={() => pick(undefined)}>
            Remover fotos
          </Button>
        )}
      </div>
    </Modal>
  )
}
