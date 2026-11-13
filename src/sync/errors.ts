/** A sync or login problem as the screen shows it: a sentence, and the raw text when it says more. */
export interface SyncProblem {
  message: string
  /** Supabase's own text, shown small under the message so a problem can still be diagnosed. */
  detail?: string
}

/** Every browser's way of saying the request never reached the server. */
const NO_CONNECTION = /failed to fetch|networkerror|load failed|fetch failed|network request failed/i

/** Supabase and the browser speak English; these are the messages the app actually meets. */
const KNOWN: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [NO_CONNECTION, 'Sem conexão com o servidor.'],
  [
    /jwt expired|invalid jwt|refresh token not found|invalid refresh token|auth session missing/i,
    'Sua sessão expirou. Entre de novo.',
  ],
  [/paused/i, 'O projeto do Supabase está pausado. Reative-o no painel do Supabase.'],
  [/rate limit|too many requests/i, 'Muitas tentativas. Espere alguns minutos e tente de novo.'],
]

/** The raw text of anything thrown. */
export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Whether the server couldn't be reached at all (as opposed to answering with a problem). */
export const isConnectionError = (error: unknown): boolean => NO_CONNECTION.test(errorText(error))

/**
 * A raw error (Supabase's message, a fetch failure) in Portuguese. What isn't known becomes `fallback`
 * with the raw text kept as the detail.
 */
export function describeSyncError(error: unknown, fallback = 'Erro ao sincronizar.'): SyncProblem {
  const raw = errorText(error).trim()
  const known = KNOWN.find(([pattern]) => pattern.test(raw))
  if (known) return { message: known[1] }
  return raw ? { message: fallback, detail: raw } : { message: fallback }
}
