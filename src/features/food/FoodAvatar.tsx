import { useLiveQuery } from 'dexie-react-hooks'
import { Utensils } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { cx } from '../../components/ui'
import { db } from '../../db/schema'
import type { FoodPref } from '../../db/types'
import { suggestFoodEmojis } from './aiEmojis'
import { avatarOf } from './emoji'
import { useFoodPrefs } from './foods'
import { usePhotoUrl } from './photos'

const SIZES = {
  sm: { box: 'size-8 rounded-lg text-lg', icon: 16 },
  md: { box: 'size-9 rounded-xl text-xl', icon: 18 },
  lg: { box: 'size-14 rounded-2xl text-3xl', icon: 24 },
  xl: { box: 'size-24 rounded-3xl text-5xl', icon: 40 },
} as const

/** What a food's avatar is made of: its prefs (photo, emoji) and the product's picture. */
export interface FoodLook {
  pref?: Pick<FoodPref, 'photoId' | 'emoji'>
  imageUrl?: string
}

/** A food's picture before its name: its photo, the product's picture, its emoji, or a plain icon. */
export function FoodAvatar({
  name,
  pref,
  imageUrl,
  emoji,
  size = 'md',
  className,
}: FoodLook & {
  name: string
  /** An emoji suggested for a food that isn't saved yet (the plate analysis). */
  emoji?: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const avatar = avatarOf(name, { photoId: pref?.photoId, imageUrl, emoji: pref?.emoji || emoji })
  const { box, icon } = SIZES[size]
  const fallback = avatar.kind !== 'icon' && avatar.emoji ? avatar.emoji : <Utensils size={icon} className="text-muted" />
  return (
    <span
      aria-hidden
      className={cx('inline-flex shrink-0 items-center justify-center overflow-hidden bg-surface-2 leading-none select-none', box, className)}
    >
      {avatar.kind === 'photo' ? (
        <StoredPicture id={avatar.photoId} fallback={fallback} />
      ) : avatar.kind === 'image' ? (
        <Picture url={avatar.url} fallback={fallback} />
      ) : (
        fallback
      )}
    </span>
  )
}

/** The user's photo of the food, from the photo store; the emoji until it's there. */
function StoredPicture({ id, fallback }: { id: string; fallback: ReactNode }) {
  const url = usePhotoUrl(id)
  return url ? <Picture url={url} fallback={fallback} /> : fallback
}

/** A picture filling the avatar, or the emoji when it doesn't load (the product's, offline). */
function Picture({ url, fallback }: { url: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState<string>()
  if (failed === url) return fallback
  return <img src={url} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(url)} />
}

/**
 * Each food's look by its id (logs carry it), from one query for the whole screen rather than one per
 * row. It also starts, once per account, the emoji suggestions for the user's own foods.
 */
export function useFoodLooks(): (foodId: string) => FoodLook {
  const prefs = useFoodPrefs()
  const images = useLiveQuery(async () => {
    const foods = await db.foods.filter((food) => !!food.imageUrl).toArray()
    return new Map(foods.map((food) => [food.id, food.imageUrl!]))
  })
  useEffect(() => suggestFoodEmojis(), [])
  return useCallback((foodId: string) => ({ pref: prefs.get(foodId), imageUrl: images?.get(foodId) }), [prefs, images])
}
