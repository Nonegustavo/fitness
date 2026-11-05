import type { Activity, ActivityStream, Exercise, PerformedSet, WorkoutSession } from '../../db/types'
import { formatDay, formatTime } from '../../lib/dates'
import { formatClock, formatDuration, formatNumber } from '../../lib/format'
import { epley, summarize, workingSets } from '../training/stats'
import { activityLabel, formatSpeed, speedKind } from './activities'

/** The image's size: 4:5, what feeds and stories crop least. */
export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

export interface CardStat {
  label: string
  value: string
}

interface CardBase {
  /** "CORRIDA", "MUSCULAÇÃO": the small line above the title, in the accent. */
  label: string
  title: string
  date: string
  accent: string
  stats: CardStat[]
}

export interface RunCard extends CardBase {
  kind: 'activity'
  track?: [number, number][]
  /** Shown big where the route would be, when there is none. */
  headline?: CardStat
}

export interface GymCard extends CardBase {
  kind: 'gym'
  records: number
  /** The exercises that stood out, with their best set. */
  top: { name: string; best: string; record: boolean }[]
}

export type ShareCard = RunCard | GymCard

const RUN_ACCENT = '#2dd4bf'
const GYM_ACCENT = '#fb923c'

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const longDate = (date: string, time?: number) =>
  `${capital(formatDay(date, "EEEE, d 'de' MMMM 'de' yyyy"))}${time !== undefined ? ` · ${formatTime(time)}` : ''}`

/** A watch activity (a run, mostly): its numbers, how hard it felt and the route. */
export function activityCard(activity: Activity, stream?: Pick<ActivityStream, 'track'> | null): RunCard {
  const kind = speedKind(activity)
  const stats: CardStat[] = []
  const moved = (activity.distanceM ?? 0) > 0
  if (moved) stats.push({ label: 'Distância', value: `${formatNumber(activity.distanceM! / 1000, 2)} km` })
  stats.push({ label: 'Tempo', value: formatClock(activity.timerSec) })
  if (moved && activity.avgSpeed) {
    stats.push({ label: kind === 'speed' ? 'Velocidade' : 'Ritmo', value: formatSpeed(activity.avgSpeed, kind) })
  }
  if (activity.avgHr) stats.push({ label: 'FC média', value: `${activity.avgHr} bpm` })
  if (activity.ascentM) stats.push({ label: 'Subida', value: `${Math.round(activity.ascentM)} m` })
  if (activity.effort) stats.push({ label: 'Esforço (PSE)', value: `${activity.effort}/10` })
  const track = stream?.track && stream.track.length > 1 ? stream.track : undefined
  const label = activityLabel(activity)
  // Without a route, the first number (the distance, usually) goes big in its place.
  const [headline, ...rest] = stats
  return {
    kind: 'activity',
    label: label.toUpperCase(),
    title: activity.title?.trim() || label,
    date: longDate(activity.date, activity.startTime),
    accent: RUN_ACCENT,
    stats: (track ? stats : rest).slice(0, 6),
    track,
    headline: track ? undefined : headline,
  }
}

/** The best set of an exercise: the heaviest by estimated 1RM, the longest hold, or the most reps. */
export function bestSetText(sets: PerformedSet[]): string | undefined {
  const weighted = sets.filter((set) => set.weightKg && set.reps)
  if (weighted.length > 0) {
    const top = weighted.reduce((a, b) => (epley(b.weightKg!, b.reps!) > epley(a.weightKg!, a.reps!) ? b : a))
    return `${formatNumber(top.weightKg!, 1)} kg × ${top.reps}`
  }
  const held = sets.flatMap((set) => (set.durationSec ? [set.durationSec] : []))
  if (held.length > 0) return formatClock(Math.max(...held))
  const reps = sets.flatMap((set) => (set.reps ? [set.reps] : []))
  return reps.length > 0 ? `${Math.max(...reps)} repetições` : undefined
}

/**
 * A finished gym workout: its time, volume and sets, the records, and three exercises that stood
 * out (the records first, then the most volume) with their best set.
 */
export function gymCard(session: WorkoutSession, exercises: Map<string, Exercise>, records: Set<string>): GymCard {
  const { sets, volumeKg, durationMs } = summarize(session)
  const ranked = session.exercises
    .map((exercise) => {
      const working = workingSets(exercise)
      const volume = working.reduce((total, set) => total + (set.weightKg ?? 0) * (set.reps ?? 0), 0)
      return { exercise, working, volume, record: records.has(exercise.exerciseId) }
    })
    .filter((item) => item.working.length > 0)
    .sort((a, b) => Number(b.record) - Number(a.record) || b.volume - a.volume || b.working.length - a.working.length)
  return {
    kind: 'gym',
    label: 'MUSCULAÇÃO',
    title: session.name,
    date: longDate(session.date, session.startedAt),
    accent: GYM_ACCENT,
    stats: [
      { label: 'Duração', value: formatDuration(durationMs ?? 0) },
      { label: 'Volume', value: `${formatNumber(volumeKg, 0)} kg` },
      { label: 'Séries', value: String(sets) },
    ],
    records: records.size,
    top: ranked.slice(0, 3).map((item) => ({
      name: exercises.get(item.exercise.exerciseId)?.name ?? 'Exercício',
      best: bestSetText(item.working) ?? `${item.working.length} séries`,
      record: item.record,
    })),
  }
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A route as points in a box: north up, longitude shrunk by the latitude so the shape isn't
 * stretched, scaled to fit and centered.
 */
export function projectTrack(track: [number, number][], box: Box): [number, number][] {
  const meanLat = track.reduce((sum, [lat]) => sum + lat, 0) / track.length
  const scale = Math.cos((meanLat * Math.PI) / 180)
  const flat = track.map(([lat, lon]): [number, number] => [lon * scale, -lat])
  const xs = flat.map(([x]) => x)
  const ys = flat.map(([, y]) => y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const spanX = maxX - minX
  const spanY = maxY - minY
  const fit = Math.min(spanX > 0 ? box.width / spanX : Infinity, spanY > 0 ? box.height / spanY : Infinity)
  const factor = Number.isFinite(fit) ? fit : 0
  const offsetX = box.x + (box.width - spanX * factor) / 2
  const offsetY = box.y + (box.height - spanY * factor) / 2
  return flat.map(([x, y]) => [offsetX + (x - minX) * factor, offsetY + (y - minY) * factor])
}

// ---------------------------------------------------------------- drawing

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const INK = '#f5f5f4'
const MUTED = '#a8a29e'
const FAINT = 'rgba(255, 255, 255, 0.06)'
const PAD = 80

type Ctx = CanvasRenderingContext2D

const font = (ctx: Ctx, size: number, weight = 400) => {
  ctx.font = `${weight} ${size}px ${FONT}`
}

const spaced = (ctx: Ctx, px: number) => {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`
}

/** The text cut with "…" to fit a width. */
function clip(ctx: Ctx, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

/** Words in lines up to a width, at most `max` lines (the last one cut). */
function wrap(ctx: Ctx, text: string, width: number, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= width || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= max) return lines
  return [...lines.slice(0, max - 1), clip(ctx, lines.slice(max - 1).join(' '), width)]
}

/** The largest size (down to `min`) at which the text fits the width. */
function fitSize(ctx: Ctx, text: string, width: number, size: number, weight: number, min: number): number {
  let current = size
  font(ctx, current, weight)
  while (current > min && ctx.measureText(text).width > width) {
    current -= 2
    font(ctx, current, weight)
  }
  return current
}

function roundRect(ctx: Ctx, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function background(ctx: Ctx, accent: string) {
  const fill = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT)
  fill.addColorStop(0, '#0f1416')
  fill.addColorStop(1, '#060708')
  ctx.fillStyle = fill
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  // A soft glow of the accent from the top right corner.
  const glow = ctx.createRadialGradient(CARD_WIDTH - 120, 80, 0, CARD_WIDTH - 120, 80, 760)
  glow.addColorStop(0, `${accent}38`)
  glow.addColorStop(1, `${accent}00`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
}

/** The label, the date and the title (up to two lines); returns where the title ends. */
function header(ctx: Ctx, card: ShareCard): number {
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  font(ctx, 30, 700)
  spaced(ctx, 6)
  ctx.fillStyle = card.accent
  ctx.fillText(clip(ctx, card.label, CARD_WIDTH - 2 * PAD), PAD, 130)
  spaced(ctx, 0)
  font(ctx, 32)
  ctx.fillStyle = MUTED
  ctx.fillText(clip(ctx, card.date, CARD_WIDTH - 2 * PAD), PAD, 182)
  font(ctx, 68, 700)
  ctx.fillStyle = INK
  const lines = wrap(ctx, card.title, CARD_WIDTH - 2 * PAD, 2)
  lines.forEach((line, i) => ctx.fillText(line, PAD, 268 + i * 80))
  return 268 + (lines.length - 1) * 80
}

function footer(ctx: Ctx, accent: string) {
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(PAD + 9, CARD_HEIGHT - 72, 9, 0, Math.PI * 2)
  ctx.fill()
  font(ctx, 30, 700)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'left'
  ctx.fillText('Fitness', PAD + 30, CARD_HEIGHT - 61)
}

/** Stats in rows of three: the label small and spaced, the value big. */
function statGrid(ctx: Ctx, stats: CardStat[], top: number, valueSize: number) {
  const width = (CARD_WIDTH - 2 * PAD) / 3
  stats.forEach((stat, i) => {
    const x = PAD + (i % 3) * width
    const y = top + Math.floor(i / 3) * (valueSize + 92)
    font(ctx, 26, 600)
    spaced(ctx, 2)
    ctx.fillStyle = MUTED
    ctx.fillText(clip(ctx, stat.label.toUpperCase(), width - 24), x, y)
    spaced(ctx, 0)
    // Room to spare before the next column, so two wide values never run together.
    fitSize(ctx, stat.value, width - 48, valueSize, 700, valueSize * 0.6)
    ctx.fillStyle = INK
    ctx.fillText(stat.value, x, y + valueSize + 14)
  })
}

function drawRoute(ctx: Ctx, track: [number, number][], box: Box, accent: string) {
  const points = projectTrack(track, box)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // A wide faint pass under the line, then the line with a glow.
  ctx.strokeStyle = `${accent}33`
  ctx.lineWidth = 26
  ctx.beginPath()
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.stroke()
  ctx.shadowColor = accent
  ctx.shadowBlur = 24
  ctx.strokeStyle = accent
  ctx.lineWidth = 10
  ctx.stroke()
  ctx.restore()
  // Hollow at the start, filled at the end, as on the map.
  const [start, end] = [points[0], points[points.length - 1]]
  ctx.lineWidth = 7
  ctx.strokeStyle = accent
  ctx.fillStyle = '#0b0f10'
  ctx.beginPath()
  ctx.arc(start[0], start[1], 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(end[0], end[1], 16, 0, Math.PI * 2)
  ctx.fill()
}

function drawActivity(ctx: Ctx, card: RunCard) {
  const titleEnd = header(ctx, card)
  const panel: Box = { x: PAD, y: titleEnd + 56, width: CARD_WIDTH - 2 * PAD, height: 0 }
  const rows = Math.ceil(card.stats.length / 3)
  const statsTop = CARD_HEIGHT - 150 - rows * 152 + 40
  panel.height = statsTop - 70 - panel.y
  roundRect(ctx, panel.x, panel.y, panel.width, panel.height, 36)
  ctx.fillStyle = FAINT
  ctx.fill()
  if (card.track) {
    drawRoute(ctx, card.track, { x: panel.x + 60, y: panel.y + 50, width: panel.width - 120, height: panel.height - 100 }, card.accent)
  } else if (card.headline) {
    ctx.textAlign = 'center'
    fitSize(ctx, card.headline.value, panel.width - 80, 170, 800, 80)
    ctx.fillStyle = card.accent
    ctx.fillText(card.headline.value, CARD_WIDTH / 2, panel.y + panel.height / 2 + 40)
    font(ctx, 30, 600)
    spaced(ctx, 4)
    ctx.fillStyle = MUTED
    ctx.fillText(card.headline.label.toUpperCase(), CARD_WIDTH / 2, panel.y + panel.height / 2 + 110)
    spaced(ctx, 0)
    ctx.textAlign = 'left'
  }
  statGrid(ctx, card.stats, statsTop, 60)
}

function drawGym(ctx: Ctx, card: GymCard) {
  const titleEnd = header(ctx, card)
  let y = titleEnd + 120
  statGrid(ctx, card.stats, y, 72)
  y += 72 + 92
  if (card.records > 0) {
    const text = `★  ${card.records === 1 ? '1 RECORDE DE CARGA' : `${card.records} RECORDES DE CARGA`}`
    font(ctx, 30, 700)
    spaced(ctx, 3)
    const width = ctx.measureText(text).width + 64
    roundRect(ctx, PAD, y, width, 68, 34)
    ctx.fillStyle = `${card.accent}26`
    ctx.fill()
    ctx.fillStyle = card.accent
    ctx.fillText(text, PAD + 32, y + 45)
    spaced(ctx, 0)
    y += 68
  }
  if (card.top.length === 0) return
  y += 70
  font(ctx, 26, 600)
  spaced(ctx, 2)
  ctx.fillStyle = MUTED
  ctx.fillText('DESTAQUES', PAD, y)
  spaced(ctx, 0)
  y += 28
  const rowHeight = Math.min(170, (CARD_HEIGHT - 130 - y) / card.top.length - 18)
  card.top.forEach((item, i) => {
    const top = y + i * (rowHeight + 18)
    roundRect(ctx, PAD, top, CARD_WIDTH - 2 * PAD, rowHeight, 32)
    ctx.fillStyle = FAINT
    ctx.fill()
    const middle = top + rowHeight / 2
    ctx.fillStyle = `${card.accent}26`
    ctx.beginPath()
    ctx.arc(PAD + 70, middle, 36, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = card.accent
    ctx.textAlign = 'center'
    font(ctx, 36, 800)
    ctx.fillText(item.record ? '★' : String(i + 1), PAD + 70, middle + 13)
    ctx.textAlign = 'left'
    const textX = PAD + 136
    const textWidth = CARD_WIDTH - PAD - textX - 36
    fitSize(ctx, item.name, textWidth, 42, 700, 30)
    ctx.fillStyle = INK
    ctx.fillText(clip(ctx, item.name, textWidth), textX, middle - 8)
    font(ctx, 36, 600)
    ctx.fillStyle = card.accent
    ctx.fillText(clip(ctx, item.best, textWidth), textX, middle + 40)
  })
}

/** The card as a PNG, drawn on a canvas with a fixed dark look. */
export async function drawCard(card: ShareCard): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Este aparelho não desenha a imagem.')
  background(ctx, card.accent)
  if (card.kind === 'gym') drawGym(ctx, card)
  else drawActivity(ctx, card)
  footer(ctx, card.accent)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não deu para gerar a imagem.'))), 'image/png'),
  )
}
