import { LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { toneColor } from '../../components/tone'
import { Button, Card, SkeletonCard } from '../../components/ui'
import { useSettings } from '../../db/hooks'
import type { DayKey } from '../../lib/dates'
import { useSyncState } from '../../sync/controller'
import { AREAS } from './areas'
import { generateInsight, insightWait, useInsight, useInsightAttempted, useInsightState, type InsightWait } from './daily'

const linkClass = 'font-medium text-accent-ink'

/** What the card says while the day has no analysis yet, and what it offers to do about it. */
const WAITS: Record<InsightWait, { text: string; action: 'run' | 'retry' | 'settings' }> = {
  soon: { text: 'Ela sai sozinha alguns segundos depois de sincronizar.', action: 'run' },
  off: { text: 'A automática, uma por dia, está desligada.', action: 'run' },
  failed: { text: 'A tentativa de hoje não deu certo.', action: 'retry' },
  signedOut: { text: 'Ela roda no seu servidor, que guarda a chave da IA: entre na sua conta para usar.', action: 'settings' },
}

/**
 * The day's analysis, wherever Hoje shows it: whether there's one yet or not. With none, when it
 * will come (or why it won't), with a button to make it now.
 */
export function useTodayInsight(today: DayKey) {
  const insight = useInsight(today)
  const attempted = useInsightAttempted(today)
  const settings = useSettings()
  const sync = useSyncState()
  const { generating, error } = useInsightState()
  const loading = insight === undefined || attempted === undefined
  const wait = insightWait({
    configured: sync.configured,
    email: sync.email,
    authChecked: sync.authChecked,
    auto: settings.insightsAuto !== false,
    attempted: attempted ?? false,
    error,
  })
  return { insight, loading, generating, error, wait }
}

/** Today's analysis in short: the headline and the areas it talks about. */
export function TodayInsightCard({ today }: { today: DayKey }) {
  const { insight, loading, generating, error, wait } = useTodayInsight(today)
  if (loading) return <SkeletonCard lines={3} />

  return (
    <Card
      icon={Sparkles}
      tone="analysis"
      title="Análise do dia"
      action={
        <Link to="/analise" className="text-sm font-medium text-accent-ink">
          {insight ? 'Ler tudo' : 'Abrir'}
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
      ) : generating ? (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <LoaderCircle size={16} className="animate-spin" /> Lendo seus dados de hoje… leva até um minuto.
        </p>
      ) : (
        <NoInsight today={today} wait={wait} error={error} />
      )}
    </Card>
  )
}

function NoInsight({ today, wait, error }: { today: DayKey; wait: InsightWait; error?: string }) {
  const { text, action } = WAITS[wait]
  return (
    <div className="space-y-3 text-sm text-ink-2">
      <p>
        <span className="font-medium text-ink">Ainda não há análise de hoje.</span> {text}
        {wait === 'off' && (
          <>
            {' '}
            <Link to="/analise" className={linkClass}>
              Ligar
            </Link>
          </>
        )}
      </p>
      {error && wait === 'failed' && <p className="line-clamp-3 rounded-xl bg-surface-2 px-3 py-2 text-xs">{error}</p>}
      {action === 'settings' ? (
        <Link to="/ajustes" className="inline-flex h-9 items-center rounded-xl bg-surface-2 px-3 text-sm font-medium text-ink">
          Entrar em Ajustes
        </Link>
      ) : (
        <Button size="sm" variant={action === 'retry' ? 'secondary' : 'primary'} onClick={() => void generateInsight(today)}>
          {action === 'retry' ? <RefreshCw size={16} /> : <Sparkles size={16} />}
          {action === 'retry' ? 'Tentar de novo' : 'Fazer agora'}
        </Button>
      )}
    </div>
  )
}
