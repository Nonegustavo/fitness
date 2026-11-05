import { Camera, LoaderCircle, Trash2, Utensils } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, cx, TextInput } from '../../components/ui'
import type { FoodPref } from '../../db/types'
import { CameraCapture } from './Camera'
import { cleanEmoji, FOOD_EMOJIS, guessEmoji } from './emoji'
import { FoodAvatar } from './FoodAvatar'
import { keepPhoto } from './photos'

/** A food's photo is a square this wide at most: plenty for an avatar, small to keep and sync. */
const FOOD_PHOTO_SIDE = 512

export type Look = Pick<FoodPref, 'photoId' | 'emoji'>

/** The food's avatar as a button that opens its photo and emoji; for the food window and the food form. */
export function LookButton({
  name,
  look,
  imageUrl,
  onChange,
}: {
  name: string
  look?: Look
  imageUrl?: string
  onChange: (change: Look) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Foto e emoji de ${name}`}
        title="Foto e emoji"
        className="relative shrink-0 rounded-2xl transition active:scale-95"
      >
        <FoodAvatar name={name} pref={look} imageUrl={imageUrl} size="lg" />
        <span
          aria-hidden
          className="absolute -right-1 -bottom-1 inline-flex size-6 items-center justify-center rounded-full border border-line bg-surface text-ink-2"
        >
          <Camera size={13} />
        </span>
      </button>
      {open && <LookModal name={name} look={look} imageUrl={imageUrl} onChange={onChange} onClose={() => setOpen(false)} />}
    </>
  )
}

function Choice({ selected, label, onClick, children }: { selected: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'inline-flex aspect-square items-center justify-center rounded-lg text-2xl leading-none transition hover:bg-surface-2 active:scale-90',
        selected && 'bg-surface-2 ring-2 ring-accent',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Sets, changes or removes a food's photo (taken in the app or from the gallery, kept as a square), and
 * its emoji: one of the common ones, any other typed in, or the one its name suggests.
 */
function LookModal({
  name,
  look,
  imageUrl,
  onChange,
  onClose,
}: {
  name: string
  look?: Look
  imageUrl?: string
  onChange: (change: Look) => void
  onClose: () => void
}) {
  const toast = useToast()
  const [camera, setCamera] = useState(false)
  const [saving, setSaving] = useState(false)
  const [typed, setTyped] = useState('')
  const guessed = guessEmoji(name)
  // An empty emoji follows the name, as no emoji at all does.
  const chosen = look?.emoji || ''

  async function keep(picture: Blob) {
    setCamera(false)
    setSaving(true)
    try {
      onChange({ photoId: await keepPhoto(picture, { square: FOOD_PHOTO_SIDE }) })
    } catch {
      toast({ message: 'Não foi possível guardar a foto.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title="Foto e emoji" onClose={onClose}>
      <div className="flex items-center gap-4">
        <FoodAvatar name={name} pref={look} imageUrl={imageUrl} size="xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="line-clamp-2 text-sm font-medium">{name}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={saving} onClick={() => setCamera(true)}>
              {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />}
              {look?.photoId ? 'Trocar a foto' : 'Tirar foto'}
            </Button>
            {look?.photoId && (
              <Button size="sm" variant="ghost" onClick={() => onChange({ photoId: undefined })}>
                <Trash2 size={16} /> Remover
              </Button>
            )}
          </div>
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-ink-2">Emoji</legend>
        <p className="mb-2 text-xs text-muted">
          {look?.photoId || imageUrl ? 'Aparece enquanto a foto não carrega.' : 'Aparece antes do nome nas listas.'}
        </p>
        <button
          type="button"
          aria-pressed={!chosen}
          onClick={() => onChange({ emoji: '' })}
          className={cx(
            'mb-2 flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-surface-2',
            !chosen && 'bg-surface-2 ring-2 ring-accent',
          )}
        >
          <span className="inline-flex w-8 justify-center text-2xl leading-none">
            {guessed || <Utensils size={20} className="text-muted" />}
          </span>
          <span>
            Automático
            <span className="block text-xs text-muted">Pelo nome do alimento</span>
          </span>
        </button>
        <div className="grid grid-cols-8 gap-1">
          {FOOD_EMOJIS.map((emoji) => (
            <Choice key={emoji} label={emoji} selected={chosen === emoji} onClick={() => onChange({ emoji })}>
              {emoji}
            </Choice>
          ))}
        </div>
        <TextInput
          className="mt-3"
          aria-label="Outro emoji"
          placeholder={chosen && !FOOD_EMOJIS.includes(chosen) ? `Outro emoji (agora ${chosen})` : 'Ou digite outro emoji'}
          value={typed}
          onChange={(e) => {
            const emoji = cleanEmoji(e.target.value)
            if (!emoji) return setTyped(e.target.value)
            onChange({ emoji })
            setTyped('')
          }}
        />
      </fieldset>

      {camera && (
        <CameraCapture
          title="Foto do alimento"
          hint="O alimento dentro do quadrado."
          square
          onCapture={(picture) => void keep(picture)}
          onClose={() => setCamera(false)}
        />
      )}
    </Modal>
  )
}
