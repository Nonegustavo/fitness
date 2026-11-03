// Supabase Edge Function: the app's door to the Garmin Connect Personal API. Garmin doesn't
// answer browsers (no CORS), and the personal key must stay private, so it lives in the
// project's secrets (GARMIN_API_KEY). Only the signed-in owner can call this, and only for
// the reads the app needs. GARMIN_CALENDAR_URL, optional, is the published Garmin Connect
// calendar (iCal) with the planned workouts.

const BASE = 'https://personal.connectapi.garmin.com'
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token'

const ALLOWED = [
  /^\/activitylist-service\/activities\/search\/activities$/,
  /^\/activity-service\/activity\/\d+\/workouts$/,
  /^\/download-service\/files\/activity\/\d+$/,
  /^\/sleep-service\/sleep\/dailySleepSummariesByDate$/,
  /^\/hrv-service\/hrv\/daily\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/,
  /^\/usersummary-service\/v2\/dailysummaries$/,
]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** The signed-in user calling, with the headers that act as them on the project's API. */
interface Caller {
  id: string
  headers: { Authorization: string; apikey: string }
}

/** Same check as analyze-meal: the caller must be a signed-in user of this project. */
async function signedInCaller(req: Request): Promise<Caller | undefined> {
  const authorization = req.headers.get('Authorization')
  const apikey = req.headers.get('apikey')
  if (!authorization || !apikey) return undefined
  try {
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey },
    })
    if (!response.ok) return undefined
    const user = (await response.json()) as { id?: unknown }
    return typeof user.id === 'string' ? { id: user.id, headers: { Authorization: authorization, apikey } } : undefined
  } catch {
    return undefined
  }
}

class GarminError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly garminStatus?: number,
  ) {
    super(message)
  }
}

/** The JWT's expiry (ms), read from its payload. */
function expiry(jwt: string): number | undefined {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined
  } catch {
    return undefined
  }
}

interface Token {
  value: string
  expiresAt: number
}

const fresh = (t: Token | undefined): t is Token => !!t && t.expiresAt - 5 * 60_000 > Date.now()

const tokenTable = () => `${Deno.env.get('SUPABASE_URL')}/rest/v1/garmin_token`

// The access token lasts 24 h. The function starts cold on most calls, so besides this copy in
// memory the token is kept in the caller's own row of garmin_token (see its migration). If that
// table fails, the function still works, only asking Garmin for a new token more often.
let token: Token | undefined

async function storedToken(caller: Caller): Promise<Token | undefined> {
  try {
    const response = await fetch(`${tokenTable()}?select=token,expires_at`, { headers: caller.headers })
    if (!response.ok) return undefined
    const [row] = (await response.json()) as { token?: string; expires_at?: string }[]
    return row?.token && row.expires_at ? { value: row.token, expiresAt: Date.parse(row.expires_at) } : undefined
  } catch {
    return undefined
  }
}

async function storeToken(caller: Caller, value: Token): Promise<void> {
  try {
    await fetch(`${tokenTable()}?on_conflict=user_id`, {
      method: 'POST',
      headers: { ...caller.headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: caller.id, token: value.value, expires_at: new Date(value.expiresAt).toISOString() }),
    })
  } catch {
    // The copy in memory still serves this call.
  }
}

async function accessToken(key: string, caller: Caller, renew = false): Promise<string> {
  if (!renew) {
    if (fresh(token)) return token.value
    const stored = await storedToken(caller)
    if (fresh(stored)) {
      token = stored
      return stored.value
    }
  }
  const response = await fetch(`${BASE}${TOKEN_PATH}`, { method: 'POST', headers: { Authorization: `ApiKey ${key}` } })
  if (response.status === 401 || response.status === 403) {
    throw new GarminError('O Garmin recusou a chave. Confira GARMIN_API_KEY nos segredos do Supabase; ela pode ter vencido.', 502, response.status)
  }
  if (!response.ok) throw upstream(response.status)
  // Garmin answers with the bare JWT; accept it quoted or wrapped too.
  const text = (await response.text()).trim()
  const value = text.startsWith('{') ? (JSON.parse(text).access_token ?? JSON.parse(text).token) : text.replace(/^"|"$/g, '')
  if (typeof value !== 'string' || value.split('.').length !== 3) throw new GarminError('Resposta inesperada do Garmin ao pedir acesso.', 502)
  token = { value, expiresAt: expiry(value) ?? Date.now() + 23 * 3_600_000 }
  await storeToken(caller, token)
  return value
}

function upstream(status: number): GarminError {
  if (status === 429) return new GarminError('O Garmin pediu uma pausa. Tente de novo mais tarde.', 429, status)
  if (status === 400) return new GarminError('O Garmin recusou o pedido; o período pode ser longo demais.', 502, status)
  if (status === 404) return new GarminError('O Garmin não tem esse dado.', 404, status)
  return new GarminError(`O Garmin respondeu com erro (${status}).`, 502, status)
}

async function garmin(path: string, query: Record<string, unknown>, key: string, caller: Caller): Promise<Response> {
  const url = new URL(path, BASE)
  for (const [name, value] of Object.entries(query)) {
    if (['string', 'number', 'boolean'].includes(typeof value)) url.searchParams.set(name, String(value))
  }
  const get = async (renew: boolean) =>
    fetch(url, {
      headers: { Authorization: `Bearer ${await accessToken(key, caller, renew)}`, Accept: 'application/json, */*' },
    })
  let response = await get(false)
  // A token revoked or expired early: ask for a new one once.
  if (response.status === 401) response = await get(true)
  if (response.status === 204) return json(null)
  if (!response.ok) throw upstream(response.status)
  const type = response.headers.get('Content-Type') ?? ''
  if (type.includes('json')) return json(await response.json())
  // Files (the .FIT inside a zip): octet-stream, so the app's client hands them over as a Blob.
  return new Response(await response.arrayBuffer(), {
    headers: { ...CORS, 'Content-Type': 'application/octet-stream' },
  })
}

async function calendar(): Promise<Response> {
  const url = Deno.env.get('GARMIN_CALENDAR_URL')
  if (!url) return json({ error: 'O link do calendário do Garmin não está nos segredos.', missing: 'calendar' }, 404)
  const response = await fetch(url, { headers: { Accept: 'text/calendar, */*' } })
  if (!response.ok) throw upstream(response.status)
  return new Response(await response.text(), { headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  const caller = await signedInCaller(req)
  if (!caller) return json({ error: 'Entre na sua conta para usar o Garmin.' }, 401)

  const body = (await req.json().catch(() => ({}))) as { path?: unknown; query?: unknown; calendar?: unknown }
  try {
    if (body.calendar === true) return await calendar()
    const key = Deno.env.get('GARMIN_API_KEY')
    if (!key) return json({ error: 'Falta a chave GARMIN_API_KEY nos segredos das funções do Supabase.', missing: 'key' }, 500)
    const path = typeof body.path === 'string' ? body.path : ''
    if (!ALLOWED.some((pattern) => pattern.test(path))) return json({ error: 'Consulta não permitida.' }, 400)
    const query = typeof body.query === 'object' && body.query !== null ? (body.query as Record<string, unknown>) : {}
    return await garmin(path, query, key, caller)
  } catch (error) {
    if (error instanceof GarminError) return json({ error: error.message, garminStatus: error.garminStatus }, error.status)
    return json({ error: 'Não foi possível falar com o Garmin.' }, 502)
  }
})
