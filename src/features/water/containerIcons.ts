import { Coffee, CupSoda, GlassWater, Milk, type LucideIcon } from 'lucide-react'
import type { ContainerIcon } from '../../db/types'

export const CONTAINER_ICONS: Record<ContainerIcon, { icon: LucideIcon; label: string }> = {
  glass: { icon: GlassWater, label: 'Copo' },
  bottle: { icon: Milk, label: 'Garrafa' },
  mug: { icon: Coffee, label: 'Caneca' },
  cup: { icon: CupSoda, label: 'Copo com tampa' },
}
