import { useState, type FormEvent } from 'react'
import { useToast } from '../../../components/Toast'
import { Button, Card } from '../../../components/ui'
import { useSettings } from '../../../db/hooks'
import { updateSettings } from '../../../db/settings'
import { PROFILE_CHARS } from '../../analysis/context'

const PROFILE_PLACEHOLDER = `Ex.: 34 anos, 1,78 m. Trabalho presencial de seg a qua, home office qui e sex.
Musculação 4x por semana (ABCD) às 18h e corrida com planilha do SisRUN.
Objetivo: perder 5 kg de gordura até março mantendo a força; correr 10 km abaixo de 50 min.
Tenho tendinite no ombro direito. Durmo mal quando treino tarde.`

/** The user in their own words, read by the daily analysis and in the summary to paste in Claude. */
export function ProfileCard() {
  const toast = useToast()
  const settings = useSettings()
  const [text, setText] = useState<string | null>(null)
  const saved = settings.profile ?? ''
  const value = text ?? saved

  async function submit(event: FormEvent) {
    event.preventDefault()
    await updateSettings(() => ({ profile: value.trim() || undefined }))
    setText(null)
    toast({ message: 'Sobre mim salvo' })
  }

  return (
    <Card title="Sobre mim">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-ink-2">
          Sua idade, rotina, histórico, limitações e objetivos. A análise do dia lê isto junto com os dados, e ele vai no
          resumo para colar no Claude.
        </p>
        <textarea
          rows={7}
          maxLength={PROFILE_CHARS}
          value={value}
          onChange={(e) => setText(e.target.value)}
          placeholder={PROFILE_PLACEHOLDER}
          className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition placeholder:text-muted focus:border-accent-ink focus:ring-2 focus:ring-accent/30"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted tabular-nums">
            {value.length}/{PROFILE_CHARS}
          </span>
          <Button type="submit" size="sm" variant="primary" disabled={value.trim() === saved.trim()}>
            Salvar
          </Button>
        </div>
      </form>
    </Card>
  )
}
