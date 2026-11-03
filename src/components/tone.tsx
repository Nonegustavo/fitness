import type { LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'

/** The sections of the app, each with its own color (--tone-* in index.css). */
export type Tone =
  | 'today'
  | 'training'
  | 'food'
  | 'body'
  | 'sleep'
  | 'analysis'
  | 'insights'
  | 'water'
  | 'habits'
  | 'journal'
  | 'recovery'
  | 'settings'

export const toneColor = (tone: Tone): string => `var(--tone-${tone})`

/** The section color, and a light wash of it for backgrounds. */
export const toneStyle = (tone: Tone, wash = 14): CSSProperties => ({
  color: toneColor(tone),
  background: `color-mix(in oklab, ${toneColor(tone)} ${wash}%, transparent)`,
})

const SIZES = { sm: ['size-7 rounded-lg', 16], md: ['size-10 rounded-xl', 22] } as const

/** A section's icon on a tile of its color. */
export function IconTile({ icon: Icon, tone, size = 'sm' }: { icon: LucideIcon; tone: Tone; size?: keyof typeof SIZES }) {
  const [box, iconSize] = SIZES[size]
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center ${box}`} style={toneStyle(tone)}>
      <Icon size={iconSize} />
    </span>
  )
}
