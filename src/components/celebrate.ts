import { successFeedback } from '../lib/haptics'

/** Confetti in the section colors, for a goal met; a short buzz on phones. Nothing with reduced motion. */
const TONES = ['training', 'food', 'water', 'habits', 'sleep', 'journal', 'analysis']
const COUNT = 90
const DURATION_MS = 1800

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  spin: number
  angle: number
  size: number
  color: string
}

let lastAt = 0

/** Whether there was a party in the last `ms` (so another one right after can skip the confetti). */
export const celebratedWithin = (ms: number): boolean => Date.now() - lastAt < ms

export function celebrate(): void {
  if (typeof window === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  lastAt = Date.now()
  successFeedback()
  const style = getComputedStyle(document.documentElement)
  const colors = TONES.map((tone) => style.getPropertyValue(`--tone-${tone}`).trim() || '#2dd4bf')

  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:80'
  const ratio = window.devicePixelRatio || 1
  canvas.width = innerWidth * ratio
  canvas.height = innerHeight * ratio
  document.body.appendChild(canvas)
  const context = canvas.getContext('2d')
  if (!context) return canvas.remove()
  context.scale(ratio, ratio)

  // Two bursts from the bottom corners, up and toward the middle.
  const pieces: Piece[] = Array.from({ length: COUNT }, (_, i) => {
    const left = i % 2 === 0
    return {
      x: left ? innerWidth * 0.1 : innerWidth * 0.9,
      y: innerHeight * 0.95,
      vx: (left ? 1 : -1) * (2 + Math.random() * 5),
      vy: -(9 + Math.random() * 7),
      spin: (Math.random() - 0.5) * 0.4,
      angle: Math.random() * Math.PI,
      size: 5 + Math.random() * 5,
      color: colors[i % colors.length],
    }
  })

  const start = performance.now()
  const frame = (now: number) => {
    const elapsed = now - start
    context.clearRect(0, 0, innerWidth, innerHeight)
    context.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - DURATION_MS * 0.6) / (DURATION_MS * 0.4))
    for (const piece of pieces) {
      piece.vy += 0.28
      piece.vx *= 0.99
      piece.x += piece.vx
      piece.y += piece.vy
      piece.angle += piece.spin
      context.save()
      context.translate(piece.x, piece.y)
      context.rotate(piece.angle)
      context.fillStyle = piece.color
      context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2)
      context.restore()
    }
    if (elapsed < DURATION_MS) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
  // Frames stop while the app is in the background; the canvas goes away regardless.
  setTimeout(() => canvas.remove(), DURATION_MS + 500)
}
