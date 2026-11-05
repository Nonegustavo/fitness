import { Check, ChevronRight, ClipboardCopy, Eye, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Confirm, Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { IconTile } from '../../components/tone'
import { Button, Card, Empty, Page, Switch } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import { patch } from '../../db/repo'
import { db, SETTINGS_ID } from '../../db/schema'
import type { DailyInsight } from '../../db/types'
import { formatDay, formatTime, relativeDay } from '../../lib/dates'
import { formatFixed, formatNumber } from '../../lib/format'
import { useSyncState } from '../../sync/controller'
import { AREAS } from './areas'
import { CHAT_INSTRUCTIONS, chatMessage } from './chatPrompt'
import { contextFor, generateInsight, useInsight, useInsightHistory, useInsightState } from './daily'

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

      <ChatCard day={day} today={today} />

      <Card>
        <Link to="/ajustes?secao=sobre-mim" className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Sobre mim</span>
            <span className="block truncate text-xs text-muted">
              {settings.profile?.trim()
                ? settings.profile.trim()
                : 'Sua rotina, histórico e objetivos, para análises mais certeiras'}
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-muted" />
        </Link>
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

/**
 * The same summary as text to paste in a conversation with Claude: no API key or cost per analysis,
 * and the conversation (or a Project) keeps the history.
 */
function ChatCard({ day, today }: { day: string; today: string }) {
  const toast = useToast()
  const [withInstructions, setWithInstructions] = useState(true)
  const [fallback, setFallback] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast({ message: `${what} copiado: cole numa conversa com o Claude` })
    } catch {
      // Some WebViews block the clipboard: show the text to copy by hand.
      setFallback(text)
    }
  }

  return (
    <Card title="Usar no app do Claude">
      <p className="text-sm text-ink-2">
        Copie o resumo dos seus dados e cole numa conversa do Claude. Usa o seu plano do Claude em vez da chave da API, e a
        conversa guarda o histórico para comparar os dias.
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm">Incluir as instruções</span>
          <span className="block text-xs text-muted">Desligue se elas já estão nas instruções de um Projeto</span>
        </span>
        <Switch checked={withInstructions} label="Incluir as instruções" onChange={setWithInstructions} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={async () => copy(chatMessage(await contextFor(day, false), withInstructions), 'Resumo')}
        >
          <ClipboardCopy size={16} /> Copiar resumo {day === today ? 'de hoje' : 'do dia'}
        </Button>
        <Button onClick={() => void copy(CHAT_INSTRUCTIONS, 'Instruções')}>Copiar só as instruções</Button>
        <Button variant="ghost" onClick={() => setPreviewing(true)}>
          <Eye size={16} /> Ver o que a IA recebe
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">
        Dica: no claude.ai, crie um Projeto “Treinador”, cole as instruções nas instruções do projeto e mande só o resumo
        a cada dia, sempre na mesma conversa ou em conversas do projeto.
      </p>
      {previewing && <ContextPreview day={day} onClose={() => setPreviewing(false)} />}
      {fallback && (
        <Modal open title="Copie o texto" onClose={() => setFallback(null)}>
          <textarea
            readOnly
            autoFocus
            rows={12}
            value={fallback}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs text-ink"
          />
        </Modal>
      )}
    </Card>
  )
}

/** Opus 5.5's price for reading, in dollars per token. */
const INPUT_PRICE = 4 / 1_000_000
/** About how many characters of Portuguese make a token. */
const CHARS_PER_TOKEN = 3.5

/** The summary exactly as the analysis reads it, with its size: to see how it's built. */
function ContextPreview({ day, onClose }: { day: string; onClose: () => void }) {
  const [text, setText] = useState<string>()
  useEffect(() => {
    let current = true
    void contextFor(day).then((built) => current && setText(built))
    return () => {
      current = false
    }
  }, [day])
  const tokens = text ? text.length / CHARS_PER_TOKEN : 0
  return (
    <Modal open title="O que a IA recebe" onClose={onClose}>
      {text === undefined ? (
        <p className="flex items-center gap-2 py-6 text-sm text-ink-2">
          <LoaderCircle size={18} className="animate-spin" /> Montando o resumo…
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            {formatNumber(text.length, 0)} caracteres · cerca de {formatNumber(tokens / 1000, 1)} mil tokens · uns US$ {formatFixed(tokens * INPUT_PRICE, 3)} para a IA
            ler (fora as instruções e a resposta).
          </p>
          <textarea
            readOnly
            rows={18}
            value={text}
            className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs text-ink"
          />
        </>
      )}
    </Modal>
  )
}
