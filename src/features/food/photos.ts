import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../../db/schema'
import { useShared } from '../../db/shared'
import { newId } from '../../lib/ids'
import { getSyncState, onSyncStateChange } from '../../sync/controller'
import { isConnectionError } from '../../sync/errors'
import { supabase } from '../../sync/supabase'

/** Private bucket in the project's storage, one folder per user (supabase/migrations). */
const BUCKET = 'fotos'
// Enough to recognize the plate later, at a fraction of the camera's file size.
const KEEP_SIDE = 1280

/**
 * Shrinks a photo, keeps it on the device and queues it for the server. Returns its id. With `square`,
 * only the middle of the picture is kept, as a square of that side at most (a food's photo).
 */
export async function keepPhoto(file: Blob, { square }: { square?: number } = {}): Promise<string> {
  const blob = await shrink(file, square)
  const id = newId()
  await db.photos.put({ id, blob, createdAt: Date.now(), pending: 1 })
  void uploadPendingPhotos()
  return id
}

async function shrink(file: Blob, square?: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const canvas = document.createElement('canvas')
  if (square) {
    const side = Math.min(bitmap.width, bitmap.height)
    canvas.width = canvas.height = Math.min(square, side)
    const [x, y] = [(bitmap.width - side) / 2, (bitmap.height - side) / 2]
    canvas.getContext('2d')!.drawImage(bitmap, x, y, side, side, 0, 0, canvas.width, canvas.height)
  } else {
    const scale = Math.min(1, KEEP_SIDE / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  }
  bitmap.close()
  return await new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível guardar a foto.'))), 'image/jpeg', 0.8),
  )
}

async function pathOf(id: string): Promise<string | undefined> {
  const user = supabase && (await supabase.auth.getSession()).data.session?.user.id
  return user ? `${user}/${id}.jpg` : undefined
}

/** How one photo's upload went: `stop` when none of the rest can go either (no session, no connection). */
export type UploadStep = 'sent' | 'failed' | 'stop'

/**
 * Goes through the queue in order. A photo that fails waits for the next round while the ones after it
 * still go, so one bad photo doesn't hold back all the others.
 */
export async function drainQueue<T>(queue: T[], send: (item: T) => Promise<UploadStep>): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0
  for (const item of queue) {
    const step = await send(item)
    if (step === 'stop') break
    if (step === 'sent') sent++
    else failed++
  }
  return { sent, failed }
}

let uploading = false

/** Sends the photos that only this device has to the server; what fails waits for the next sync. */
export async function uploadPendingPhotos(): Promise<void> {
  const client = supabase
  if (uploading || !client || !navigator.onLine) return
  uploading = true
  try {
    await drainQueue(await db.photos.where('pending').equals(1).toArray(), async (photo) => {
      if (!navigator.onLine) return 'stop'
      const path = await pathOf(photo.id)
      if (!path) return 'stop'
      try {
        const { error } = await client.storage
          .from(BUCKET)
          .upload(path, photo.blob, { contentType: 'image/jpeg', upsert: true })
        if (error) throw error
      } catch (error) {
        // The server out of reach fails every photo alike; anything else is this photo's own problem.
        return isConnectionError(error) ? 'stop' : 'failed'
      }
      await db.photos.update(photo.id, { pending: 0 })
      return 'sent'
    })
  } finally {
    uploading = false
  }
}

/** The photos still to send: how many, and since when the oldest waits. */
export interface PendingPhotos {
  count: number
  oldestAt?: number
}

export async function pendingPhotos(): Promise<PendingPhotos> {
  const pending = await db.photos.where('pending').equals(1).toArray()
  const oldestAt = pending.length ? Math.min(...pending.map((photo) => photo.createdAt)) : undefined
  return { count: pending.length, ...(oldestAt !== undefined && { oldestAt }) }
}

/** One read for every place that shows it (the status dots are on several screens at once). */
export const usePendingPhotos = (): PendingPhotos | undefined => useShared('pendingPhotos', pendingPhotos)

/** Uploads after every successful sync, so photos follow the records that point at them. */
export function startPhotoUploads(): void {
  let last = getSyncState().lastSyncAt
  onSyncStateChange(() => {
    const { phase, lastSyncAt } = getSyncState()
    if (phase !== 'idle' || lastSyncAt === last) return
    last = lastSyncAt
    void uploadPendingPhotos()
  })
}

const downloading = new Set<string>()

async function download(id: string) {
  if (!supabase || downloading.has(id)) return
  downloading.add(id)
  try {
    const path = await pathOf(id)
    if (!path) return
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    if (!error && data) await db.photos.put({ id, blob: data, createdAt: Date.now(), pending: 0 })
  } finally {
    downloading.delete(id)
  }
}

/** The photo as an image URL: from this device, or fetched from the server once and kept. */
export function usePhotoUrl(id: string | undefined): string | undefined {
  const local = useLiveQuery(async () => (id ? ((await db.photos.get(id)) ?? null) : undefined), [id])
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    if (!local) return
    const objectUrl = URL.createObjectURL(local.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [local])

  useEffect(() => {
    if (id && local === null) void download(id)
  }, [id, local])

  return local ? url : undefined
}
