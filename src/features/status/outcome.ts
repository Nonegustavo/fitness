/**
 * How a source's runs went (Garmin's fetches, Health Connect's imports), kept in its local meta row so
 * a failure is still known after the app restarts.
 */
export interface SourceError {
  at: number
  message: string
  /** The HTTP status, when the server sent one. */
  status?: number
  /** A secret that isn't set up yet: "not set up", not an error. */
  missing?: 'key' | 'calendar'
}

export interface Outcome {
  /** The last run that worked. */
  lastOkAt?: number
  /** The last run that failed, until one works. */
  lastError?: SourceError
}

/** A run that worked: its time, and the earlier problem gone. */
export function recordSuccess<T extends Outcome>(meta: T, at: number): T {
  const { lastError: _solved, ...rest } = meta
  return { ...rest, lastOkAt: at } as T
}

/** A run that failed; the last success stays as it was. */
export function recordFailure<T extends Outcome>(meta: T, error: SourceError): T {
  return { ...meta, lastError: error }
}

/**
 * When the source last worked. A meta written before the outcome was kept has only the time of the
 * last attempt, which is the best guess there is.
 */
export const lastSuccess = (meta: Outcome & { lastRunAt?: number }): number | undefined =>
  meta.lastOkAt ?? (meta.lastError ? undefined : meta.lastRunAt)

/** The problem of the last run, when it failed after the last success (an older one was solved since). */
export const currentError = (outcome: Outcome): SourceError | undefined =>
  outcome.lastError && (outcome.lastOkAt === undefined || outcome.lastError.at > outcome.lastOkAt) ? outcome.lastError : undefined
