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

/** Same check as analyze-meal: the caller must be a signed-in user of this project. */
async function isSignedIn(req: Request): Promise<boolean> {
  const authorization = req.headers.get('Authorization')
  const apikey = req.headers.get('apikey')
  if (!authorization || !apikey) return false
  try {
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey },
    })
    return response.ok
  } catch {
    return false
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

// The access token lasts 24 h; a warm function reuses it instead of asking Garmin again.
let token: { value: string; expiresAt: number } | undefined

async function accessToken(key: string, renew = false): Promise<string> {
  if (!renew && token && token.expiresAt - 5 * 60_000 > Date.now()) return token.value
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
  return value
}

function upstream(status: number): GarminError {
  if (status === 429) return new GarminError('O Garmin pediu uma pausa. Tente de novo mais tarde.', 429, status)
  if (status === 400) return new GarminError('O Garmin recusou o pedido; o período pode ser longo demais.', 502, status)
  if (status === 404) return new GarminError('O Garmin não tem esse dado.', 404, status)
  return new GarminError(`O Garmin respondeu com erro (${status}).`, 502, status)
}

async function garmin(path: string, query: Record<string, unknown>, key: string): Promise<Response> {
  const url = new URL(path, BASE)
  for (const [name, value] of Object.entries(query)) {
    if (['string', 'number', 'boolean'].includes(typeof value)) url.searchParams.set(name, String(value))
  }
  const get = async (renew: boolean) =>
    fetch(url, { headers: { Authorization: `Bearer ${await accessToken(key, renew)}`, Accept: 'application/json, */*' } })
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
  if (!(await isSignedIn(req))) return json({ error: 'Entre na sua conta para usar o Garmin.' }, 401)

  const body = (await req.json().catch(() => ({}))) as { path?: unknown; query?: unknown; calendar?: unknown }
  try {
    if (body.calendar === true) return await calendar()
    const key = Deno.env.get('GARMIN_API_KEY')
    if (!key) return json({ error: 'Falta a chave GARMIN_API_KEY nos segredos das funções do Supabase.', missing: 'key' }, 500)
    const path = typeof body.path === 'string' ? body.path : ''
    if (!ALLOWED.some((pattern) => pattern.test(path))) return json({ error: 'Consulta não permitida.' }, 400)
    const query = typeof body.query === 'object' && body.query !== null ? (body.query as Record<string, unknown>) : {}
    return await garmin(path, query, key)
  } catch (error) {
    if (error instanceof GarminError) return json({ error: error.message, garminStatus: error.garminStatus }, error.status)
    return json({ error: 'Não foi possível falar com o Garmin.' }, 502)
  }
})
