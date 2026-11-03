import { Check, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Confirm } from '../../components/Modal'
import { IconTile } from '../../components/tone'
import { Button, Card, Empty, Page, Switch } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { DailyInsight } from '../../db/types'
import { formatDay, formatTime, relativeDay } from '../../lib/dates'
import { useSyncState } from '../../sync/controller'
import { AREAS } from './areas'
import { generateInsight, useInsight, useInsightHistory, useInsightState } from './daily'

export default function AnalysisPage() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const day = params.get('data') ?? today
  const insight = useInsight(day)
  const history = useInsightHistory()
  const settings = useSettings()
  const sync = useSyncState()
  const { generating, error } = useInsightState()
  const [confirming, setConfirming] = useState(false)
  const canGenerate = sync.configured && !!sync.email
  const others = (history ?? []).filter((item) => item.id !== day)

  return (
    <Page title="Análise do dia" icon={Sparkles} tone="analysis" subtitle="O Claude lê seus dados e o diário e diz o que vê e o que fazer">
      <Card>
        {insight ? (
          <InsightView insight={insight} />
        ) : generating ? (
          <p className="flex items-center gap-2 py-6 text-sm text-ink-2">
            <LoaderCircle size={18} className="animate-spin" /> Lendo seus dados… leva até um minuto.
          </p>
        ) : day !== today ? (
          <Empty>Não houve análise neste dia.</Empty>
        ) : !canGenerate ? (
          <p className="text-sm text-ink-2">
            A análise roda num servidor seu (Supabase), que guarda a chave da IA. Ligue a sincronização e entre na sua
            conta em{' '}
            <Link to="/ajustes" className="font-medium text-accent-ink">
              Ajustes
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-3 py-2 text-sm text-ink-2">
            <p>Ainda não há análise de hoje.</p>
            {error && <p className="rounded-xl bg-surface-2 p-3">{error}</p>}
            <Button variant="primary" onClick={() => void generateInsight(today)}>
              <Sparkles size={16} /> Fazer a análise agora
            </Button>
          </div>
        )}
        {insight && day === today && canGenerate && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <span className="text-xs text-muted">Feita às {formatTime(insight.createdAt)}</span>
            <Button size="sm" variant="ghost" disabled={generating} onClick={() => setConfirming(true)}>
              {generating ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Fazer de novo
            </Button>
          </div>
        )}
        {insight && error && day === today && <p className="mt-2 text-xs text-critical">{error}</p>}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Todo dia, ao abrir o app</span>
            <span className="block text-xs text-muted">Uma análise por dia, cerca de US$ 0,15 cada, cobrada na sua chave</span>
          </span>
          <Switch
            checked={settings.insightsAuto !== false}
            label="Fazer a análise todo dia"
            onChange={(on) => void patch(db.settings, SETTINGS_ID, { insightsAuto: on })}
          />
        </div>
      </Card>

      {others.length > 0 && (
        <Card title="Outros dias">
          <ul className="divide-y divide-line">
            {others.slice(0, 30).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setParams(item.id === today ? {} : { data: item.id }, { replace: true })
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="w-full py-2.5 text-left hover:text-accent-ink"
                >
                  <span className="block text-xs text-muted first-letter:uppercase">{relativeDay(item.id, today)}</span>
                  <span className="line-clamp-2 block text-sm">{item.headline}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {confirming && (
        <Confirm
          title="Fazer a análise de novo?"
          message="Uma nova leitura dos dados de agora, no lugar da de hoje. Custa cerca de US$ 0,15 na sua chave da Anthropic."
          confirmLabel="Fazer de novo"
          onClose={() => setConfirming(false)}
          onConfirm={() => void generateInsight(today)}
        />
      )}
    </Page>
  )
}

function InsightView({ insight }: { insight: DailyInsight }) {
  return (
    <article>
      <p className="mb-1 text-xs text-muted first-letter:uppercase">{formatDay(insight.id)}</p>
      <h2 className="text-lg leading-snug font-semibold">{insight.headline}</h2>
      <div className="mt-4 space-y-5">
        {insight.sections.map((section, i) => {
          const { label, icon, tone } = AREAS[section.area]
          return (
            <section key={i}>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <IconTile icon={icon} tone={tone} />
                <span className="sr-only">{label}: </span>
                {section.title}
              </h3>
              <p className="mt-1 text-sm text-ink-2">{section.text}</p>
              {section.tips.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {section.tips.map((tip, j) => (
                    <li key={j} className="flex gap-2 text-sm">
                      <Check size={16} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
                      {tip}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </article>
  )
}
