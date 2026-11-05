import { DEFAULT_MEDIA } from '../../db/defaultExercises'
import type { Exercise } from '../../db/types'

/**
 * Pictures and steps from free-exercise-db (github.com/yuhonas/free-exercise-db), loaded from jsDelivr
 * when shown: nothing of it ships with the app, and without internet the screens simply go without.
 */
const BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main'
export const MEDIA_HOME = 'https://github.com/yuhonas/free-exercise-db'

/** One exercise of the dataset, as its JSON has it. */
export interface MediaEntry {
  id: string
  name: string
  equipment: string | null
  primaryMuscles: string[]
  instructions: string[]
  /** Paths under exercises/: the start and end positions. */
  images: string[]
  category: string
}

/**
 * The dataset's exercise for one of the app's: the one the user linked, or else the default library's.
 * An empty `mediaId` is the user taking the pictures off.
 */
export const mediaIdOf = (exercise: Pick<Exercise, 'id' | 'mediaId'>): string | undefined =>
  (exercise.mediaId ?? DEFAULT_MEDIA[exercise.id]) || undefined

/** What `mediaId` takes for "no pictures": empty when the default library would bring them back. */
export const noMedia = (exerciseId: string | undefined): string | undefined =>
  exerciseId && DEFAULT_MEDIA[exerciseId] ? '' : undefined

/** The pictures of an exercise of the dataset (start and end): every one keeps them as <id>/0.jpg and 1.jpg. */
export const mediaImages = (mediaId: string): string[] =>
  [0, 1].map((i) => `${BASE}/exercises/${encodeURIComponent(mediaId)}/${i}.jpg`)

/** The first picture of an exercise of the library, when it has pictures. */
export function exerciseThumb(exercise: Pick<Exercise, 'id' | 'mediaId'>): string | undefined {
  const mediaId = mediaIdOf(exercise)
  return mediaId ? mediaImages(mediaId)[0] : undefined
}

/** A picture of the dataset by its path ("Plank/0.jpg"). */
export const mediaImage = (path: string): string => `${BASE}/exercises/${path.split('/').map(encodeURIComponent).join('/')}`

/** The dataset's name from its id, for showing a link before anything loads. */
export const mediaLabel = (mediaId: string): string => mediaId.replace(/_/g, ' ')

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

let index: Promise<MediaEntry[]> | undefined
/** The whole dataset (about 150 kB compressed), once per run, to search it. */
export function loadMediaIndex(): Promise<MediaEntry[]> {
  index ??= getJson<MediaEntry[]>(`${BASE}/dist/exercises.json`).catch((error: unknown) => {
    index = undefined
    throw error
  })
  return index
}

const entries = new Map<string, Promise<MediaEntry>>()
/** One exercise of the dataset (about 1 kB), for its steps. */
export function loadMediaEntry(mediaId: string): Promise<MediaEntry> {
  let entry = entries.get(mediaId)
  if (!entry) {
    entry = getJson<MediaEntry>(`${BASE}/exercises/${encodeURIComponent(mediaId)}.json`).catch((error: unknown) => {
      entries.delete(mediaId)
      throw error
    })
    entries.set(mediaId, entry)
  }
  return entry
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// The gym's Portuguese, in the dataset's English: a name like "Supino inclinado com halteres" finds
// "Incline Dumbbell Press". Each word or phrase can be any of its alternatives; phrases go first, and an
// alternative marked "~" counts half (a "press" is a supino only if nothing better says so).
const PHRASES: [string, string[]][] = [
  ['barra fixa', ['pullup', 'pull up', 'chin up']],
  ['barra w', ['ez bar', 'ez']],
  ['levantamento terra', ['deadlift']],
  ['bom dia', ['good morning']],
  ['peck deck', ['butterfly']],
  ['em pe', ['standing']],
  ['prancha lateral', ['side bridge']],
  ['elevacao lateral', ['lateral raise', 'side lateral', 'deltoid raise']],
  ['elevacao frontal', ['front raise', 'front dumbbell raise']],
  ['elevacao pelvica', ['hip thrust', 'glute bridge']],
  ['elevacao de pernas', ['leg raise']],
  ['cadeira extensora', ['leg extension']],
  ['cadeira flexora', ['seated leg curl']],
  ['mesa flexora', ['lying leg curl']],
  ['rosca direta', ['barbell curl', '~curl']],
  ['rosca scott', ['preacher curl']],
  ['rosca concentrada', ['concentration curl']],
  ['triceps testa', ['lying triceps press', 'skullcrusher', 'skull crusher']],
  ['triceps frances', ['triceps press', 'overhead triceps', 'triceps extension']],
  ['remada alta', ['upright row']],
  ['remada baixa', ['seated cable row']],
  ['remada cavalinho', ['t bar row']],
  ['puxada frontal', ['lat pulldown']],
  ['puxada alta', ['lat pulldown']],
]
const WORDS: Record<string, string[]> = {
  supino: ['bench press', 'chest press', '~press'],
  inclinado: ['incline'],
  inclinada: ['incline'],
  declinado: ['decline'],
  declinada: ['decline'],
  halter: ['dumbbell'],
  halteres: ['dumbbell'],
  barra: ['barbell'],
  polia: ['cable'],
  cabo: ['cable'],
  maquina: ['machine', 'lever'],
  crucifixo: ['fly', 'flye'],
  voador: ['butterfly'],
  inverso: ['reverse'],
  flexao: ['push up', 'pushup'],
  paralela: ['dip'],
  paralelas: ['dip'],
  mergulho: ['dip'],
  remada: ['row'],
  puxada: ['pulldown'],
  terra: ['deadlift'],
  stiff: ['stiff legged', 'romanian deadlift'],
  hiperextensao: ['hyperextension', 'back extension'],
  lombar: ['back extension', 'lower back'],
  encolhimento: ['shrug'],
  desenvolvimento: ['shoulder press', 'military press', '~press'],
  militar: ['military'],
  arnold: ['arnold'],
  pullover: ['pullover'],
  lateral: ['lateral'],
  frontal: ['front'],
  rosca: ['curl'],
  alternada: ['alternate'],
  alternado: ['alternate', 'alternating'],
  martelo: ['hammer'],
  scott: ['preacher'],
  biceps: ['biceps', 'bicep'],
  triceps: ['triceps'],
  corda: ['rope'],
  coice: ['kickback'],
  punho: ['wrist'],
  agachamento: ['squat'],
  sumo: ['sumo', 'plie'],
  bulgaro: ['split squat'],
  afundo: ['lunge', 'split squat'],
  avanco: ['lunge'],
  passada: ['lunge'],
  extensora: ['leg extension'],
  flexora: ['leg curl'],
  gluteo: ['glute', 'kickback'],
  gluteos: ['glute'],
  pelvica: ['hip thrust'],
  abdutora: ['abductor'],
  abducao: ['abductor'],
  adutora: ['adductor'],
  aducao: ['adductor'],
  panturrilha: ['calf raise', 'calf'],
  gemeos: ['calf raise'],
  abdominal: ['crunch', 'sit up'],
  supra: ['crunch'],
  infra: ['reverse crunch', 'leg raise', 'leg pull in'],
  prancha: ['plank'],
  obliquo: ['oblique'],
  esteira: ['treadmill'],
  bicicleta: ['bicycling'],
  ergometrica: ['stationary'],
  eliptico: ['elliptical'],
  escada: ['step mill', 'stairmaster'],
  corrida: ['running'],
  caminhada: ['walking'],
  elastico: ['band'],
  sentado: ['seated'],
  sentada: ['seated'],
  deitado: ['lying'],
  deitada: ['lying'],
  unilateral: ['one arm', 'single arm', 'one leg', 'single leg'],
  serrote: ['one arm dumbbell row'],
  fechada: ['close grip'],
  fechado: ['close grip'],
  aberta: ['wide grip'],
  aberto: ['wide grip'],
  neutra: ['neutral grip'],
  perna: ['leg'],
  pernas: ['leg'],
  ombro: ['shoulder'],
  ombros: ['shoulder'],
  peito: ['chest'],
  costas: ['back'],
  antebraco: ['forearm', 'wrist'],
}
/** Words that say nothing about the movement ("com", "reto"…). */
const FILLER = new Set(['com', 'na', 'no', 'nas', 'nos', 'de', 'do', 'da', 'em', 'e', 'o', 'a', 'reto', 'reta', 'livre', 'pegada'])

/** The query as groups of alternatives, each group one word or phrase of it. */
export function searchTerms(query: string): string[][] {
  let text = ` ${normalize(query)} `
  const groups: string[][] = []
  for (const [phrase, alternatives] of PHRASES) {
    if (!text.includes(` ${phrase} `)) continue
    groups.push(alternatives)
    text = text.replace(` ${phrase} `, ' ')
  }
  for (const word of text.split(' ')) {
    // A lone letter ("W", "V") would start too many words to mean anything.
    if (word.length < 2 || FILLER.has(word)) continue
    groups.push(WORDS[word] ?? [word])
  }
  return groups
}

/** How much a name matches a group: 1 for an alternative, ½ for a "~" one, from the start of a word. */
function groupScore(name: string, group: string[]): number {
  let best = 0
  for (const alternative of group) {
    const weak = alternative.startsWith('~')
    if (name.includes(` ${weak ? alternative.slice(1) : alternative}`)) best = Math.max(best, weak ? 0.5 : 1)
  }
  return best
}

/** The plain versions of the common movements: the ones the default library uses. */
const PLAIN = new Set(Object.values(DEFAULT_MEDIA))

/**
 * The dataset's exercises that best match a name, in Portuguese or English: the most words matched
 * first, then the plain version of a movement (the default library's), then the shorter names.
 */
export function searchMedia(all: MediaEntry[], query: string, limit = 30): MediaEntry[] {
  const groups = searchTerms(query)
  if (groups.length === 0) return []
  return all
    .map((entry) => {
      const name = ` ${normalize(entry.name)} `
      return { entry, score: groups.reduce((total, group) => total + groupScore(name, group), 0) }
    })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(PLAIN.has(b.entry.id)) - Number(PLAIN.has(a.entry.id)) ||
        a.entry.name.length - b.entry.name.length,
    )
    .slice(0, limit)
    .map(({ entry }) => entry)
}

const EQUIPMENT_PT: Record<string, string> = {
  barbell: 'Barra',
  dumbbell: 'Halteres',
  cable: 'Polia',
  machine: 'Máquina',
  'body only': 'Peso corporal',
  kettlebells: 'Kettlebell',
  bands: 'Elástico',
  'e-z curl bar': 'Barra W',
  'medicine ball': 'Medicine ball',
  'exercise ball': 'Bola suíça',
  'foam roll': 'Rolo',
  other: 'Outro',
}
const MUSCLES_PT: Record<string, string> = {
  chest: 'Peito',
  shoulders: 'Ombros',
  quadriceps: 'Quadríceps',
  hamstrings: 'Posteriores de coxa',
  abdominals: 'Abdômen',
  triceps: 'Tríceps',
  biceps: 'Bíceps',
  lats: 'Dorsais',
  'middle back': 'Costas',
  'lower back': 'Lombar',
  traps: 'Trapézio',
  calves: 'Panturrilhas',
  glutes: 'Glúteos',
  forearms: 'Antebraços',
  adductors: 'Adutores',
  abductors: 'Abdutores',
  neck: 'Pescoço',
}

/** "Peito · Barra", in Portuguese. */
export const mediaDetail = (entry: MediaEntry): string =>
  [
    entry.primaryMuscles.map((muscle) => MUSCLES_PT[muscle] ?? muscle).join(', '),
    entry.equipment && (EQUIPMENT_PT[entry.equipment] ?? entry.equipment),
  ]
    .filter(Boolean)
    .join(' · ')
