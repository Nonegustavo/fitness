import { LoaderCircle, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { toneColor } from '../../components/tone'
import { Card } from '../../components/ui'
import type { DayKey } from '../../lib/dates'
import { AREAS } from './areas'
import { useInsight, useInsightState } from './daily'

/** Today's analysis in short: the headline and the areas it talks about. */
export function TodayInsightCard({ today }: { today: DayKey }) {
  const insight = useInsight(today)
  const { generating } = useInsightState()
  if (insight === undefined || (insight === null && !generating)) return null

  return (
    <Card
      icon={Sparkles}
      tone="analysis"
      title="Análise do dia"
      action={
        <Link to="/analise" className="text-sm font-medium text-accent-ink">
          Ler tudo
        </Link>
      }
    >
      {insight ? (
        <Link to="/analise" className="block">
          <p className="leading-snug font-medium">{insight.headline}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {insight.sections.map((section, i) => {
              const { icon: Icon, tone } = AREAS[section.area]
              return (
                <li key={i} className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink-2">
                  <Icon size={12} aria-hidden style={{ color: toneColor(tone) }} /> {section.title}
                </li>
              )
            })}
          </ul>
        </Link>
      ) : (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <LoaderCircle size={16} className="animate-spin" /> Lendo seus dados de hoje…
        </p>
      )}
    </Card>
  )
}
