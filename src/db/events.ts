const listeners = new Set<() => void>()

/** Subscribes to local writes (the sync scheduler listens here). */
export function onLocalChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifyLocalChange(): void {
  for (const listener of listeners) listener()
}
