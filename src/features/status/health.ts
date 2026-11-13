import { dayKey, formatTime, relativeDay } from '../../lib/dates'
import { currentError, type SourceError } from './outcome'

export type HealthLevel = 'ok' | 'warn' | 'error' | 'off'

export type SourceId = 'sync' | 'garmin' | 'healthConnect' | 'sisrun' | 'photos' | 'update'

/**
 * What a source's row offers: `setup` links to its card in Ajustes (a source not set up yet); the others
 * run it now.
 */
export type SourceAction = 'signIn' | 'sync' | 'garmin' | 'healthConnect' | 'sisrun' | 'photos' | 'setup'

export interface SourceHealth {
  id: SourceId
  name: string
  level: HealthLevel
  text: string
  /** The raw problem, small under the text, when it says more. */
  detail?: string
  lastOkAt?: number
  action?: SourceAction
}

export interface HealthInputs {
  sync: {
    configured: boolean
    /** The saved login was read (until then a missing e-mail doesn't mean signed out). */
    authChecked: boolean
    signedIn: boolean
    expired: boolean
    phase: 'idle' | 'syncing' | 'error' | 'offline'
    online: boolean
    /** The last sync's problem, translated. */
    error?: string
    errorDetail?: string
    lastOkAt?: number
    /** Records not sent yet. */
    pending: number
  }
  garmin: {
    syncing: boolean
    lastOkAt?: number
    lastError?: SourceError
  }
  /** Only in the Android app. */
  healthConnect?: {
    availability?: 'available' | 'update_required' | 'unavailable'
    /** Whether anything may be read. */
    granted: boolean
    busy: boolean
    lastOkAt?: number
    lastError?: SourceError
  }
  /** The coach's plan as kept on this device; undefined while it is read. */
  sisrun?: {
    fetchedAt?: number
    error?: { message: string; at: number; missing?: boolean }
  }
  photos: { count: number; oldestAt?: number }
  /** Fed by the app's update check: a new version that only installs with the cable. */
  update?: { needsCable: boolean }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
/** Pending records with no sync for this long are worth a look. */
const PENDING_STALE_MS = 10 * MINUTE
/** Garmin is fetched while the app is open, at most every 3 hours: two days without one is not normal. */
const GARMIN_STALE_MS = 48 * HOUR
/** A photo is usually sent within seconds; an hour means the queue is stuck. */
const PHOTO_STALE_MS = HOUR

/** "hoje, 08:12", "ontem, 22:40", "3 de nov., 07:05". */
export const whenText = (at: number, now: number): string => `${relativeDay(dayKey(at), dayKey(now))}, ${formatTime(at)}`

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function syncHealth(sync: HealthInputs['sync'], now: number): SourceHealth {
  const base = { id: 'sync' as const, name: 'Sincronização', lastOkAt: sync.lastOkAt }
  if (!sync.configured) return { ...base, level: 'off', text: 'Só neste aparelho' }
  if (!sync.authChecked) return { ...base, level: 'off', text: 'Verificando a conta…' }
  if (sync.expired) return { ...base, level: 'error', text: 'Sua sessão expirou. Entre de novo.', action: 'signIn' }
  if (!sync.signedIn) return { ...base, level: 'off', text: 'Entre para sincronizar', action: 'signIn' }
  if (sync.phase === 'syncing') return { ...base, level: 'ok', text: 'Sincronizando…' }
  if (sync.phase === 'error') {
    return { ...base, level: 'error', text: sync.error ?? 'Erro ao sincronizar.', detail: sync.errorDetail, action: 'sync' }
  }
  const pending = plural(sync.pending, 'pendente', 'pendentes')
  if (sync.phase === 'offline' || !sync.online) {
    return sync.pending > 0 ? { ...base, level: 'warn', text: `Sem internet · ${pending}` } : { ...base, level: 'ok', text: 'Sem internet' }
  }
  if (sync.pending > 0 && (sync.lastOkAt === undefined || now - sync.lastOkAt > PENDING_STALE_MS)) {
    return { ...base, level: 'warn', text: `${pending} sem sincronizar`, action: 'sync' }
  }
  return { ...base, level: 'ok', text: sync.lastOkAt ? `Sincronizado ${whenText(sync.lastOkAt, now)}` : 'Conectado' }
}

function garminHealth({ garmin, sync }: HealthInputs, now: number): SourceHealth {
  const base = { id: 'garmin' as const, name: 'Garmin', lastOkAt: garmin.lastOkAt }
  if (!sync.signedIn) return { ...base, level: 'off', text: 'Precisa da conta conectada', action: 'setup' }
  const error = currentError(garmin)
  if (error?.missing === 'key') return { ...base, level: 'off', text: 'Ainda não ligado', action: 'setup' }
  if (garmin.syncing) return { ...base, level: 'ok', text: 'Buscando…' }
  if (error) return { ...base, level: 'error', text: 'A última busca falhou', detail: error.message, action: 'garmin' }
  if (garmin.lastOkAt === undefined) return { ...base, level: 'off', text: 'Nenhuma busca ainda', action: 'garmin' }
  if (now - garmin.lastOkAt > GARMIN_STALE_MS) {
    return { ...base, level: 'warn', text: 'Mais de dois dias sem buscar', action: 'garmin' }
  }
  return { ...base, level: 'ok', text: `Buscado ${whenText(garmin.lastOkAt, now)}` }
}

function healthConnectHealth(hc: NonNullable<HealthInputs['healthConnect']>, now: number): SourceHealth {
  const base = { id: 'healthConnect' as const, name: 'Health Connect', lastOkAt: hc.lastOkAt }
  if (hc.availability === undefined) return { ...base, level: 'off', text: 'Verificando…' }
  if (hc.availability === 'unavailable') return { ...base, level: 'off', text: 'Não disponível neste aparelho' }
  if (hc.availability === 'update_required') return { ...base, level: 'off', text: 'Precisa ser atualizado', action: 'setup' }
  if (!hc.granted) return { ...base, level: 'warn', text: 'Sem permissão para ler', action: 'setup' }
  if (hc.busy) return { ...base, level: 'ok', text: 'Importando…' }
  const error = currentError(hc)
  if (error) return { ...base, level: 'error', text: 'A última importação falhou', detail: error.message, action: 'healthConnect' }
  if (hc.lastOkAt === undefined) return { ...base, level: 'ok', text: 'Nenhuma importação ainda', action: 'healthConnect' }
  return { ...base, level: 'ok', text: `Importado ${whenText(hc.lastOkAt, now)}` }
}

function sisrunHealth({ sisrun, sync }: HealthInputs, now: number): SourceHealth {
  const base = { id: 'sisrun' as const, name: 'SisRUN', lastOkAt: sisrun?.fetchedAt }
  if (!sync.signedIn || !sisrun) return { ...base, level: 'off', text: 'Não configurado', action: 'setup' }
  const { fetchedAt, error } = sisrun
  if (error?.missing) return { ...base, level: 'off', text: 'Não configurado', action: 'setup' }
  if (error && (fetchedAt === undefined || error.at > fetchedAt)) {
    return { ...base, level: 'error', text: 'A última leitura falhou', detail: error.message, action: 'sisrun' }
  }
  if (fetchedAt === undefined) return { ...base, level: 'off', text: 'Não configurado', action: 'setup' }
  return { ...base, level: 'ok', text: `Planilha lida ${whenText(fetchedAt, now)}` }
}

function photosHealth({ photos, sync }: HealthInputs, now: number): SourceHealth {
  const base = { id: 'photos' as const, name: 'Fotos' }
  if (photos.count === 0) return { ...base, level: 'ok', text: 'Todas enviadas' }
  const waiting = plural(photos.count, 'foto esperando envio', 'fotos esperando envio')
  // Without the account they can't go anywhere: the sync's row already says so.
  if (!sync.signedIn) return { ...base, level: 'off', text: waiting }
  if (photos.oldestAt !== undefined && now - photos.oldestAt > PHOTO_STALE_MS) {
    return { ...base, level: 'warn', text: waiting, action: 'photos' }
  }
  return { ...base, level: 'ok', text: plural(photos.count, 'foto sendo enviada', 'fotos sendo enviadas') }
}

function updateHealth(update: NonNullable<HealthInputs['update']>): SourceHealth {
  const base = { id: 'update' as const, name: 'Atualização do app' }
  return update.needsCable
    ? { ...base, level: 'warn', text: 'Há uma versão nova que precisa ser instalada pelo cabo.' }
    : { ...base, level: 'ok', text: 'Em dia' }
}

/** How every source of data on this device is doing, in the order Ajustes lists them. */
export function sourceHealth(inputs: HealthInputs, now: number): SourceHealth[] {
  return [
    syncHealth(inputs.sync, now),
    garminHealth(inputs, now),
    ...(inputs.healthConnect ? [healthConnectHealth(inputs.healthConnect, now)] : []),
    sisrunHealth(inputs, now),
    photosHealth(inputs, now),
    ...(inputs.update ? [updateHealth(inputs.update)] : []),
  ]
}

const SEVERITY: Record<HealthLevel, number> = { off: 0, ok: 1, warn: 2, error: 3 }

/** The source that most needs a look (the first one of the worst level), if any. */
export function worstSource(entries: SourceHealth[]): SourceHealth | undefined {
  let worst: SourceHealth | undefined
  for (const entry of entries) if (!worst || SEVERITY[entry.level] > SEVERITY[worst.level]) worst = entry
  return worst
}

/** The worst level among the sources ('off' when there are none). */
export const worstLevel = (entries: SourceHealth[]): HealthLevel => worstSource(entries)?.level ?? 'off'

/** Whether something needs the user's look (a dot on the gear, a line in the sidebar). */
export const needsAttention = (level: HealthLevel): boolean => level === 'warn' || level === 'error'
