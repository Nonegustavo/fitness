import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * A call to one of the project's functions that didn't work. The message reads well as is: the
 * function's own, when it answered with one.
 */
export class FunctionError extends Error {
  constructor(
    message: string,
    /** The status the function answered with; undefined when it wasn't reached at all. */
    readonly status?: number,
    /** The function's JSON answer: besides `error`, what else it says about it (`missing`, `reason`…). */
    readonly payload: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export interface InvokeOptions {
  /** Said when the build has no Supabase project. */
  unconfigured: string
  /** Said when the function answers with an error but no message. */
  fallback: string
  /** How long to wait. Without a limit, a connection gone quiet left the screen waiting forever. */
  timeoutMs: number
}

/** The plate photo, the label and the text analysis: a Claude call, usually 10 to 30 seconds. */
export const AI_TIMEOUT_MS = 90_000
/** The functions' own limit: the daily analysis and SisRUN's three pages can come close to it. */
export const LONG_TIMEOUT_MS = 150_000

export const OFFLINE_MESSAGE = 'Não foi possível falar com o servidor. Confira a internet.'
export const TIMEOUT_MESSAGE = 'O servidor demorou demais para responder. Tente de novo.'

/** What a failed `functions.invoke` becomes: the function's own message, a timeout, or no connection. */
export async function toFunctionError(error: unknown, fallback: string): Promise<FunctionError> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
    return new FunctionError(typeof payload?.error === 'string' ? payload.error : fallback, response.status, payload ?? {})
  }
  const cause = error instanceof FunctionsFetchError ? (error.context as { name?: string } | undefined) : undefined
  return new FunctionError(cause?.name === 'AbortError' || cause?.name === 'TimeoutError' ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE)
}

/**
 * Calls one of the project's functions (supabase/functions) as the signed-in user and hands back its
 * answer. Throws a FunctionError otherwise.
 */
export async function invokeFunction<T = unknown>(name: string, body: object, options: InvokeOptions): Promise<T> {
  if (!supabase) throw new FunctionError(options.unconfigured)
  const { data, error } = await supabase.functions.invoke(name, { body, timeout: options.timeoutMs })
  if (error) throw await toFunctionError(error, options.fallback)
  return data as T
}
