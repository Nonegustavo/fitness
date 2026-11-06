// Supabase Edge Function: the coach's plan (the planilha) from SisRUN, for the signed-in owner.
//
// SisRUN has no API, so this logs in to the athlete site (appsisrun.com.br) with the owner's e-mail
// and password, kept only in the project's secrets (SISRUN_EMAIL, SISRUN_PASSWORD), and reads the
// current week and the next one. It only reads: nothing is ever sent to SisRUN but the login and the
// week navigation. The session handling follows client.py of sisrun-mcp
// (https://github.com/cdutr/sisrun-mcp, MIT, Copyright (c) 2026 Carlos Dutra; see LICENSE-sisrun-mcp).
//
// SisRUN is JSF + PrimeFaces: every request carries the page's javax.faces.ViewState, and the widget
// ids are generated (they change when SisRUN redeploys), so buttons are found by their stable titles.
// The current week comes whole on a plain GET. The next one needs the "next week" button's AJAX
// call, sent with the inputs the page has (the open state of the day panels among them) and
// execute=@all, or the server answers the days without their workouts' details.

import { decodeEntities, parseWeek, type CoachWeek } from './planilha.ts'

const BASE = 'https://appsisrun.com.br'
const LOGIN_URL = `${BASE}/sisrun/login.xhtml`
const PLAN_URL = `${BASE}/sisrun/pages/planilha/formPlanilhaAluno.xhtml`
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
/** Someone else's server: one page at a time, spaced out. */
const PAUSE_MS = 600
const TIMEOUT_MS = 30_000
const WEEK_RE = /\d{2}\/\d{2}\/\d{4} até \d{2}\/\d{2}\/\d{4}/
/** Inline images are most of every page and never read. */
const DATA_URI_RE = /data:[a-zA-Z0-9.+/-]+;base64,[A-Za-z0-9+/=]+/g

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** Same check as the other functions: the caller must be a signed-in user of this project. */
async function isSignedIn(req: Request): Promise<boolean> {
  const authorization = req.headers.get('Authorization')
  const apikey = req.headers.get('apikey')
  if (!authorization || !apikey) return false
  try {
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey },
    })
    if (!response.ok) return false
    const user = (await response.json()) as { id?: unknown }
    return typeof user.id === 'string'
  } catch {
    return false
  }
}

type Reason = 'login' | 'layout' | 'network'

class SisrunError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: Reason,
  ) {
    super(message)
  }
}

const layoutChanged = (what: string) =>
  new SisrunError(`${what} O site do SisRUN pode ter mudado.`, 502, 'layout')

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A button's title as a pattern: an accented letter may come as itself or as an HTML reference. */
const titlePattern = (title: string) =>
  [...title].map((char) => (char.charCodeAt(0) > 127 ? `(?:${char}|&[a-zA-Z]+;|&#x?[0-9a-fA-F]+;)` : escapeRe(char))).join('')

/** The page's ViewState: a hidden input on full pages, a CDATA update in AJAX answers. */
function viewStateOf(body: string): string | undefined {
  const input = /name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/.exec(body)
  if (input) return decodeEntities(input[1])
  const update = /<update id="[^"]*ViewState[^"]*"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/.exec(body)
  return update ? decodeEntities(update[1].trim()) : undefined
}

/**
 * A PrimeFaces button of a form, found by its title (or, for the login, by its class or as the
 * form's first button), with the targets its click re-renders.
 */
function findButton(body: string, form: string, title?: string): { id: string; render?: string } | undefined {
  const formId = escapeRe(form)
  const patterns = title
    ? [
        new RegExp(`<button[^>]*id="(${formId}:[^"]+)"[^>]*title="${titlePattern(title)}"`),
        new RegExp(`<button[^>]*title="${titlePattern(title)}"[^>]*id="(${formId}:[^"]+)"`),
      ]
    : [new RegExp(`<button[^>]*id="(${formId}:[^"]+)"[^>]*class="[^"]*login-btn-entrar`), new RegExp(`<button[^>]*id="(${formId}:[^"]+)"`)]
  for (const pattern of patterns) {
    const match = pattern.exec(body)
    if (!match) continue
    const id = match[1]
    const tag = new RegExp(`<button[^>]*id="${escapeRe(id)}"[\\s\\S]*?</button>`).exec(body)
    const onclick = tag ? /onclick="([^"]*)"/.exec(tag[0]) : null
    const render = onclick ? /u:"([^"]*)"/.exec(decodeEntities(onclick[1]))?.[1] : undefined
    return { id, render }
  }
  return undefined
}

/** Every input of the form a browser would send back, checkboxes and radios only when checked. */
function formInputs(body: string, form: string): Record<string, string> {
  const inputs: Record<string, string> = {}
  for (const [tag] of body.matchAll(/<input\b[^>]*>/gi)) {
    const name = /name="([^"]+)"/.exec(tag)?.[1]
    if (!name?.startsWith(`${form}:`)) continue
    const type = (/type="([^"]*)"/i.exec(tag)?.[1] ?? 'text').toLowerCase()
    const value = decodeEntities(/value="([^"]*)"/.exec(tag)?.[1] ?? '')
    if (type === 'checkbox' || type === 'radio') {
      if (tag.toLowerCase().includes('checked')) inputs[name] = value || 'on'
    } else {
      inputs[name] = value
    }
  }
  return inputs
}

/** A browser-like session: cookies, the current ViewState and the form's inputs so far. */
class Session {
  private cookies = new Map<string, string>()
  viewState?: string
  /**
   * The main form's inputs, gathered across pages: an AJAX answer re-renders only part of the page,
   * so taking the inputs from each answer alone would drop those outside it (the open state of the
   * day panels, without which the workouts come without details).
   */
  private form: Record<string, string> = {}

  absorb(body: string) {
    const found = formInputs(body, 'frmPrincipal')
    if (Object.keys(found).length === 0) return
    // The day panels' state is redrawn with each week: last week's doesn't carry over.
    if (Object.keys(found).some((name) => name.endsWith('_active'))) {
      for (const name of Object.keys(this.form)) if (name.endsWith('_active')) delete this.form[name]
    }
    Object.assign(this.form, found)
  }

  get formState(): Record<string, string> {
    return { ...this.form }
  }

  private keep(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0]
      const equals = pair.indexOf('=')
      if (equals > 0) this.cookies.set(pair.slice(0, equals).trim(), pair.slice(equals + 1).trim())
    }
  }

  private async request(url: string, init: { method: 'GET' | 'POST'; body?: string; headers?: Record<string, string> }): Promise<string> {
    let target = url
    let current = init
    // Redirects by hand, so the cookies set along the way are kept.
    for (let hop = 0; hop < 6; hop++) {
      let response: Response
      try {
        response = await fetch(target, {
          method: current.method,
          body: current.body,
          redirect: 'manual',
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: {
            'User-Agent': USER_AGENT,
            'Accept-Language': 'pt-BR,pt;q=0.9',
            ...(this.cookies.size > 0 && { Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ') }),
            ...current.headers,
          },
        })
      } catch {
        throw new SisrunError('Não foi possível falar com o SisRUN.', 502, 'network')
      }
      this.keep(response)
      const location = response.headers.get('Location')
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel()
        target = new URL(location, target).toString()
        current = { method: 'GET' }
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new SisrunError(`O SisRUN respondeu com o erro ${response.status}.`, 502, 'network')
      }
      const body = await response.text()
      const state = viewStateOf(body)
      if (state) this.viewState = state
      return body
    }
    throw new SisrunError('O SisRUN redirecionou demais.', 502, 'network')
  }

  get(url: string): Promise<string> {
    return this.request(url, { method: 'GET' })
  }

  /** A PrimeFaces AJAX call, as the page's own script sends it. */
  post(url: string, fields: Record<string, string>): Promise<string> {
    return this.request(url, {
      method: 'POST',
      body: new URLSearchParams(fields).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: url,
      },
    })
  }
}

async function login(session: Session, email: string, password: string): Promise<void> {
  const page = await session.get(LOGIN_URL)
  if (!session.viewState) throw layoutChanged('A tela de login do SisRUN veio sem o ViewState.')
  const button = findButton(page, 'frmLogin')
  if (!button) throw layoutChanged('Não achei o botão de entrar do SisRUN.')
  const reply = await session.post(LOGIN_URL, {
    'javax.faces.partial.ajax': 'true',
    'javax.faces.source': button.id,
    'javax.faces.partial.execute': 'frmLogin',
    'javax.faces.partial.render': 'frmLogin',
    [button.id]: button.id,
    frmLogin: 'frmLogin',
    'frmLogin:email': email,
    'frmLogin:senha': password,
    'javax.faces.ViewState': session.viewState,
  })
  if (!decodeEntities(reply).includes('"logado":true')) {
    throw new SisrunError(
      'O SisRUN não aceitou o login. Confira o e-mail e a senha nos segredos SISRUN_EMAIL e SISRUN_PASSWORD.',
      422,
      'login',
    )
  }
}

/** The week after the one on `body`, through the "next week" button; undefined when there's none. */
async function nextWeek(session: Session, body: string): Promise<string | undefined> {
  const button = findButton(body, 'frmPrincipal', 'Muda para próxima semana')
  if (!button || !session.viewState) return undefined
  session.absorb(body)
  await pause(PAUSE_MS)
  const reply = await session.post(PLAN_URL, {
    'javax.faces.partial.ajax': 'true',
    'javax.faces.source': button.id,
    // @all, as the page itself sends: a narrower execute skips the panels' state.
    'javax.faces.partial.execute': '@all',
    'javax.faces.partial.render': button.render ?? 'frmPrincipal:painelSemana frmPrincipal:divSemana',
    [button.id]: button.id,
    frmPrincipal: 'frmPrincipal',
    ...session.formState,
    'javax.faces.ViewState': session.viewState,
  })
  return WEEK_RE.test(reply) ? reply : undefined
}

/** The current week and the `ahead` ones after it, as pages without their inline images. */
async function fetchWeeks(email: string, password: string, ahead: number): Promise<string[]> {
  const session = new Session()
  await login(session, email, password)
  const current = await session.get(PLAN_URL)
  if (!WEEK_RE.test(current)) throw layoutChanged('A planilha veio sem a semana.')
  const pages = [current]
  let body = current
  for (let i = 0; i < ahead; i++) {
    const next = await nextWeek(session, body)
    if (!next) break
    pages.push(next)
    body = next
  }
  return pages.map((page) => page.replace(DATA_URI_RE, 'data:,'))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  if (!(await isSignedIn(req))) return json({ error: 'Entre na sua conta para usar o SisRUN.' }, 401)

  const email = Deno.env.get('SISRUN_EMAIL')
  const password = Deno.env.get('SISRUN_PASSWORD')
  if (!email || !password) {
    return json({ error: 'Faltam os segredos SISRUN_EMAIL e SISRUN_PASSWORD nas funções do Supabase.', missing: 'credentials' }, 404)
  }

  const body = (await req.json().catch(() => ({}))) as { weeksAhead?: unknown; raw?: unknown }
  const ahead = typeof body.weeksAhead === 'number' ? Math.max(0, Math.min(2, Math.round(body.weeksAhead))) : 1
  try {
    const pages = await fetchWeeks(email, password, ahead)
    const weeks: CoachWeek[] = []
    const problems: string[] = []
    for (const page of pages) {
      try {
        weeks.push(parseWeek(page))
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error))
      }
    }
    if (weeks.length === 0) throw layoutChanged(`Não consegui ler a planilha (${problems.join('; ')}).`)
    // `raw` is for finding out what changed when the reading breaks: the pages as they came.
    return json({ fetchedAt: Date.now(), weeks, ...(problems.length > 0 && { problems }), ...(body.raw === true && { pages }) })
  } catch (error) {
    if (error instanceof SisrunError) return json({ error: error.message, reason: error.reason }, error.status)
    return json({ error: 'Não foi possível ler a planilha do SisRUN.' }, 502)
  }
})
