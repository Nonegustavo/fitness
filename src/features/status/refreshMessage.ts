import type { SourceError } from './outcome'

export interface RefreshOutcome {
  configured: boolean
  signedIn: boolean
  expired: boolean
  /** The sync's problem, translated, when it failed. */
  syncError?: string
  /** Garmin's problem, when this refresh's fetch failed. */
  garminError?: SourceError
  /** Garmin was already fetching (started before the pull): its outcome isn't known yet. */
  garminBusy: boolean
}

/** The toast after pulling Hoje down: what actually happened, not a blanket "Atualizado.". */
export function refreshMessage(outcome: RefreshOutcome): string {
  if (!outcome.configured) return 'Os dados ficam só neste aparelho.'
  if (outcome.expired) return 'Sua sessão expirou. Entre de novo, em Ajustes.'
  if (!outcome.signedIn) return 'Entre na conta, em Ajustes, para sincronizar.'
  if (outcome.syncError) return `Não deu para sincronizar: ${outcome.syncError}`
  // A key not saved yet is a step still to do, not a failure of this refresh.
  if (outcome.garminError && outcome.garminError.missing !== 'key') {
    return `Sincronizado, mas o Garmin falhou: ${outcome.garminError.message}`
  }
  if (outcome.garminBusy) return 'Sincronizado. O Garmin ainda está buscando.'
  return 'Atualizado.'
}
