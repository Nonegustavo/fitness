// Reads a week of the SisRUN planilha (the athlete's page at appsisrun.com.br) into workouts.
//
// Ported to TypeScript from parser.py of sisrun-mcp (https://github.com/cdutr/sisrun-mcp, MIT,
// Copyright (c) 2026 Carlos Dutra; see LICENSE-sisrun-mcp), which was written against the real
// pages. Every generated id on the page (j_idtNNN) changes when SisRUN redeploys, so the days are
// found by their stable class names and read as text, the way a browser shows them.
//
// No imports and no Deno APIs: the Edge Function uses it, and the app's tests and types too.

/** One workout of the coach's plan. */
export interface CoachWorkout {
  /** YYYY-MM-DD. */
  date: string
  /** Monday of its week, YYYY-MM-DD. */
  weekStart: string
  /** Proposto (prescribed), Programado, Feito, Não Feito, Justificado, or Feito Avulso (done without a prescription). */
  status: string
  modality: string
  type: string
  route: string
  /** The coach's own distance field: empty on interval days, where it also counts only the reps. */
  distanceKm?: number
  /** The distance prescribed: the larger of that field and the sum of the structured session. */
  plannedKm?: number
  /** A timed step had to be turned into distance at an assumed pace. */
  plannedKmEstimated?: boolean
  intensity?: string
  hrMin?: number
  hrMax?: number
  timeMin?: string
  timeMax?: string
  /** The coach's structured session, a step per line; the steps of a repeat start with "-". */
  structure: string[]
  /** The coach's note on the workout. */
  note?: string
  /** What SisRUN matched as done (it imports the Garmin and Strava activities). */
  done?: { date?: string; km?: number; time?: string; hr?: number; kcal?: number }
}

export interface CoachWeek {
  /** Monday, YYYY-MM-DD. */
  start: string
  workouts: CoachWorkout[]
  /** Workouts came without their detail panels (the structure): the request missed some state, or the page changed. */
  detailsMissing: boolean
}

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
// Longest first, so "Feito Avulso" isn't read as "Feito".
const STATUSES = ['Feito Avulso', 'Não Feito', 'Justificado', 'Programado', 'Proposto', 'Feito']
const WEEK_RE = /(\d{2})\/(\d{2})\/(\d{4}) até (\d{2})\/(\d{2})\/(\d{4})/

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const BLOCK_TAGS = new Set([
  'div', 'p', 'table', 'tr', 'li', 'ul', 'ol', 'br', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'fieldset', 'legend', 'section',
])
const RAW_TAGS = new Set(['script', 'style'])

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  aacute: 'á', Aacute: 'Á', agrave: 'à', Agrave: 'À', acirc: 'â', Acirc: 'Â', atilde: 'ã', Atilde: 'Ã', auml: 'ä',
  eacute: 'é', Eacute: 'É', egrave: 'è', ecirc: 'ê', Ecirc: 'Ê', iacute: 'í', Iacute: 'Í', icirc: 'î',
  oacute: 'ó', Oacute: 'Ó', ocirc: 'ô', Ocirc: 'Ô', otilde: 'õ', Otilde: 'Õ', ouml: 'ö',
  uacute: 'ú', Uacute: 'Ú', ucirc: 'û', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ',
  ordm: 'º', ordf: 'ª', deg: '°', middot: '·', bull: '•', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×', copy: '©', reg: '®',
}

/** HTML character references back into text: "&atilde;", "&#227;", "&#xe3;" → "ã". Unknown names stay. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return ENTITIES[name] ?? match
  })
}

interface TreeNode {
  tag: string
  cls: string
  parent?: TreeNode
  children: TreeNode[]
  text?: string
}

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/y
const CLASS_RE = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i

function addText(parent: TreeNode, raw: string) {
  const text = decodeEntities(raw)
  if (!text.trim()) return
  parent.children.push({ tag: '#text', cls: '', parent, children: [], text })
}

/**
 * A minimal DOM, enough to find nodes by class and read their text: lenient like a browser's parser
 * about end tags that don't match, with script and style skipped and comments dropped.
 */
function buildTree(html: string): TreeNode {
  const root: TreeNode = { tag: '#root', cls: '', children: [] }
  let current = root
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      addText(current, html.slice(i))
      break
    }
    if (lt > i) addText(current, html.slice(i, lt))
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4)
      i = close === -1 ? html.length : close + 3
      continue
    }
    if (html.startsWith('<![CDATA[', lt)) {
      const close = html.indexOf(']]>', lt + 9)
      if (close === -1) break
      addText(current, html.slice(lt + 9, close))
      i = close + 3
      continue
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const close = html.indexOf('>', lt)
      i = close === -1 ? html.length : close + 1
      continue
    }
    TAG_RE.lastIndex = lt
    const match = TAG_RE.exec(html)
    if (!match) {
      addText(current, '<')
      i = lt + 1
      continue
    }
    const [whole, closing, rawName, attributes, selfClosing] = match
    const tag = rawName.toLowerCase()
    i = lt + whole.length
    if (closing) {
      if (VOID_TAGS.has(tag)) continue
      let node: TreeNode | undefined = current
      while (node && node !== root && node.tag !== tag) node = node.parent
      if (node && node !== root) current = node.parent ?? root
      continue
    }
    if (RAW_TAGS.has(tag)) {
      if (selfClosing) continue
      const end = new RegExp(`</${tag}\\s*>`, 'gi')
      end.lastIndex = i
      const found = end.exec(html)
      i = found ? found.index + found[0].length : html.length
      continue
    }
    const cls = CLASS_RE.exec(attributes)
    const node: TreeNode = { tag, cls: cls ? (cls[1] ?? cls[2] ?? cls[3] ?? '') : '', parent: current, children: [] }
    current.children.push(node)
    if (!VOID_TAGS.has(tag) && !selfClosing) current = node
  }
  return root
}

/** Like a browser's innerText: new lines around block elements, a tab after each table cell. */
function innerText(node: TreeNode, out: string[] = []): string[] {
  if (node.tag === '#text') {
    out.push(node.text ?? '')
    return out
  }
  const block = BLOCK_TAGS.has(node.tag)
  if (block) out.push('\n')
  for (const child of node.children) innerText(child, out)
  if (node.tag === 'td' || node.tag === 'th') out.push('\t')
  if (block) out.push('\n')
  return out
}

/** Spaces collapsed, each line trimmed, and no more than one empty line in a row. */
function cleanText(text: string): string {
  const out: string[] = []
  let blanks = 0
  for (const line of text.replace(/[ \u00a0]+/g, ' ').split('\n').map((part) => part.trim())) {
    if (!line) {
      blanks++
      if (blanks > 1) continue
    } else {
      blanks = 0
    }
    out.push(line)
  }
  return out.join('\n').trim()
}

function findByClass(node: TreeNode, cls: string, found: TreeNode[] = []): TreeNode[] {
  if (node.cls.includes(cls)) found.push(node)
  for (const child of node.children) findByClass(child, cls, found)
  return found
}

function ancestorWithClass(node: TreeNode, cls: string): TreeNode | undefined {
  let current = node.parent
  while (current) {
    if (current.cls.includes(cls)) return current
    current = current.parent
  }
  return undefined
}

/** A full page, or the CDATA of a JSF partial response (what week navigation answers). */
export function unwrapPartial(raw: string): string {
  if (!raw.slice(0, 400).includes('<partial-response')) return raw
  return [...raw.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((match) => match[1]).join('\n')
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const DAY_RE = new RegExp(`(${WEEKDAYS.map(escapeRe).join('|')})[^\\n]*\\n+\\s*(\\d{1,2})\\b`)

/** Each day of the week with its text. `.planilhaDiaSemana` marks a day; the responsive layout draws each day 3 times. */
function dayBlocks(body: string): { weekday: string; day: number; text: string }[] {
  const root = buildTree(body)
  const seen = new Set<string>()
  const blocks: { weekday: string; day: number; text: string }[] = []
  for (const label of findByClass(root, 'planilhaDiaSemana')) {
    const row = ancestorWithClass(label, 'ui-grid-row') ?? label.parent
    if (!row) continue
    const text = cleanText(innerText(row).join(''))
    const match = DAY_RE.exec(text)
    if (!match) continue
    const key = `${match[1]}|${match[2]}`
    if (seen.has(key)) continue
    seen.add(key)
    blocks.push({ weekday: match[1], day: Number(match[2]), text })
  }
  return blocks
}

/** SisRUN writes numbers the Brazilian way: "7,802 Km" is 7.802 km, "1.200" is 1200. */
function planNumber(text: string | undefined): number | undefined {
  if (!text?.trim()) return undefined
  const value = Number(text.trim().replace(/\./g, '').replace(/,/g, '.'))
  return Number.isFinite(value) ? value : undefined
}

const STEP_KM = /por\s+([\d.,]+)\s*km\b/i
const STEP_M = /por\s+([\d.,]+)\s*m(?![a-z])/i
// "completar entre 115m e 134m": the plan's own estimate of the distance of a timed step.
const STEP_BETWEEN_M = /completar entre\s+([\d.,]+)\s*m\s+e\s+([\d.,]+)\s*m\b/i
const STEP_MIN = /por\s+([\d.,]+)\s*min\b/i
const STEP_HOUR = /por\s+([\d.,]+)\s*h\b/i
const STEP_BAND = /\((\d{1,2}):(\d{2})\s*a\s*(\d{1,2}):(\d{2})\s*min\/km\)/
const REPEAT = /(?:^|\.\s*)Repetir\s+(\d+)\s*x/i
/** A timed step without a pace band: the middle of a typical "Moderada" band (05:47–07:27 min/km). */
const DEFAULT_PACE_MIN_KM = 6.62

/** The distance of one step of the session, and whether it had to be estimated from a time. */
function stepDistanceKm(step: string): [number, boolean] {
  if (/\bDescansar\b/i.test(step)) return [0, false]
  const km = STEP_KM.exec(step)
  if (km) return [planNumber(km[1]) ?? 0, false]
  const meters = STEP_M.exec(step)
  if (meters) return [(planNumber(meters[1]) ?? 0) / 1000, false]
  const between = STEP_BETWEEN_M.exec(step)
  if (between) return [((planNumber(between[1]) ?? 0) + (planNumber(between[2]) ?? 0)) / 2000, false]
  let minutes: number | undefined
  const min = STEP_MIN.exec(step)
  if (min) minutes = planNumber(min[1])
  else {
    const hours = STEP_HOUR.exec(step)
    if (hours) minutes = (planNumber(hours[1]) ?? 0) * 60
  }
  if (!minutes) return [0, false]
  const band = STEP_BAND.exec(step)
  const pace = band ? (Number(band[1]) + Number(band[2]) / 60 + Number(band[3]) + Number(band[4]) / 60) / 2 : DEFAULT_PACE_MIN_KM
  return [minutes / pace, true]
}

/**
 * The distance a structured session prescribes, with "Repetir Nx" blocks expanded (their steps are
 * the next lines that start with a dash), and whether some timed step was estimated.
 */
export function structureDistanceKm(steps: string[]): [number, boolean] {
  let total = 0
  let estimated = false
  for (let i = 0; i < steps.length; ) {
    const repeat = REPEAT.exec(steps[i])
    if (repeat) {
      const times = Number(repeat[1])
      let j = i + 1
      while (j < steps.length && steps[j].trimStart().startsWith('-')) {
        const [km, guess] = stepDistanceKm(steps[j])
        total += times * km
        estimated ||= guess
        j++
      }
      i = j
      continue
    }
    const [km, guess] = stepDistanceKm(steps[i])
    total += km
    estimated ||= guess
    i++
  }
  return [Math.round(total * 1000) / 1000, estimated]
}

const field = (text: string, label: string): string =>
  new RegExp(`${escapeRe(label)}\\s*:?\\s*([^\\n]*)`).exec(text)?.[1].trim() ?? ''

const STRUCTURE_RE =
  /Estruturado:\s*\n([\s\S]*?)(?=\n(?:Tempo Mínimo|Intensidade|FC Mínima|Feedback do Aluno|Feedback do Treinador|Mensagens|Descrição)\b|$)/

/** "dd/mm/aaaa" → "aaaa-mm-dd". */
const isoDate = (text: string) => `${text.slice(6, 10)}-${text.slice(3, 5)}-${text.slice(0, 2)}`

/** The workouts of one day: each starts with a status cell. */
function dayWorkouts(text: string): Omit<CoachWorkout, 'date' | 'weekStart'>[] {
  const status = new RegExp(`^(${STATUSES.map(escapeRe).join('|')})\\t`, 'gm')
  const hits = [...text.matchAll(status)]
  return hits.map((hit, i) => {
    const chunk = text.slice(hit.index, i + 1 < hits.length ? hits[i + 1].index : text.length)
    const cells = chunk.split('\n', 1)[0].split('\t')
    const cell = (n: number) => cells[n]?.trim() ?? ''
    const distance = /^([\d.,]+)\s*Km/i.exec(cell(4))

    const structured = STRUCTURE_RE.exec(chunk)
    const structure = structured
      ? structured[1]
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      : []

    const description = /Descrição:\s*\n([^\n]*)/.exec(chunk)
    const note = description && !description[1].includes('adicionado automaticamente') ? description[1].trim() : ''

    // What SisRUN itself matched to this prescription (it imports the Garmin and Strava activities).
    const done: NonNullable<CoachWorkout['done']> = {}
    const feedbackAt = chunk.indexOf('Feedback do Aluno')
    if (feedbackAt !== -1) {
      const feedback = chunk.slice(feedbackAt + 'Feedback do Aluno'.length)
      const day = /Data Realização:\s*(\d{2}\/\d{2}\/\d{4})/.exec(feedback)
      if (day) done.date = isoDate(day[1])
      const km = /Distância:\s*([\d.,]+)\s*Km/.exec(feedback)
      if (km) done.km = planNumber(km[1])
      const time = /Tempo:\s*(\d{2}:\d{2}:\d{2})/.exec(feedback)
      if (time) done.time = time[1]
      const hr = /FC Média:\s*(\d+)/.exec(feedback)
      if (hr) done.hr = Number(hr[1])
      const kcal = /Calorias:\s*(\d+)/.exec(feedback)
      if (kcal) done.kcal = Number(kcal[1])
    }

    // The distance field is empty on interval, hill and timed sessions (and counts only the reps on
    // interval days), so the structure's sum is the honest number when it's larger.
    const fieldKm = distance ? planNumber(distance[1]) : undefined
    const [structureKm, estimated] = structureDistanceKm(structure)
    let plannedKm = fieldKm
    let plannedKmEstimated = false
    if (structureKm > 0 && (fieldKm === undefined || structureKm > fieldKm)) {
      plannedKm = structureKm
      plannedKmEstimated = estimated
    }

    const workout: Omit<CoachWorkout, 'date' | 'weekStart'> = {
      status: hit[1],
      modality: cell(1),
      type: cell(2),
      route: cell(3),
      structure,
    }
    if (fieldKm !== undefined) workout.distanceKm = fieldKm
    if (plannedKm !== undefined) workout.plannedKm = plannedKm
    if (plannedKmEstimated) workout.plannedKmEstimated = true
    const intensity = field(chunk, 'Intensidade')
    if (intensity) workout.intensity = intensity
    const hrMin = planNumber(field(chunk, 'FC Mínima').replace(/\s*bpm/i, ''))
    if (hrMin !== undefined) workout.hrMin = hrMin
    const hrMax = planNumber(field(chunk, 'FC Máxima').replace(/\s*bpm/i, ''))
    if (hrMax !== undefined) workout.hrMax = hrMax
    const timeMin = field(chunk, 'Tempo Mínimo')
    if (timeMin) workout.timeMin = timeMin
    const timeMax = field(chunk, 'Tempo Máximo')
    if (timeMax) workout.timeMax = timeMax
    if (note) workout.note = note
    if (Object.keys(done).length > 0) workout.done = done
    return workout
  })
}

/** Whether workouts came without any detail panel: the accordion state wasn't sent, or the page changed. */
export function detailsMissing(raw: string): boolean {
  const body = unwrapPartial(raw)
  const count = (word: string) => body.split(word).length - 1
  const workouts = count('Feedback deste treino')
  return workouts > 0 && count('Estruturado') + count('Feedback do Aluno') === 0
}

/**
 * The workouts of one week of the planilha (a full page or a navigation's partial response), by
 * day and in the page's order. A week the coach hasn't published is an empty list; a page without
 * the week's header ("dd/mm/aaaa até dd/mm/aaaa") throws.
 */
export function parseWeek(raw: string): CoachWeek {
  const body = unwrapPartial(raw)
  const header = WEEK_RE.exec(body)
  if (!header) throw new Error('A planilha veio sem o cabeçalho da semana ("dd/mm/aaaa até dd/mm/aaaa").')
  const monday = Date.UTC(Number(header[3]), Number(header[2]) - 1, Number(header[1]))
  const start = new Date(monday).toISOString().slice(0, 10)
  const workouts: CoachWorkout[] = []
  for (const { weekday, day, text } of dayBlocks(body)) {
    const date = new Date(monday + WEEKDAYS.indexOf(weekday) * 86_400_000)
    // The header and the day's cell disagree: better left out than put on the wrong day.
    if (date.getUTCDate() !== day) continue
    for (const workout of dayWorkouts(text)) workouts.push({ date: date.toISOString().slice(0, 10), weekStart: start, ...workout })
  }
  // Stable: the workouts of a day keep the page's order.
  workouts.sort((a, b) => a.date.localeCompare(b.date))
  return { start, workouts, detailsMissing: detailsMissing(raw) }
}
