import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../../db/schema'
import { foodsToReview, readReview, type ReviewItem, type ReviewState } from './review'

/** The user's foods with something to check, live; undefined while they load. */
export function useFoodReview(): { items?: ReviewItem[]; state?: ReviewState } {
  const foods = useLiveQuery(() => db.foods.toArray())
  const state = useLiveQuery(readReview)
  const items = useMemo(() => (foods && state ? foodsToReview(foods, state.flags) : undefined), [foods, state])
  return { items, state }
}
