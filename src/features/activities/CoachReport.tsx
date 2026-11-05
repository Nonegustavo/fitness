import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardCopy, FileText, Share2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Button, Segmented, SkeletonLines } from '../../components/ui'
import { shiftDay, weekStart, type DayKey } from '../../lib/dates'
import { shareText } from '../../lib/share'
import { useEventTimes } from '../calendar/plans'
import { pastEvents, withPastEvents } from '../garmin/calendarHistory'
import { usePlannedEvents } from '../garmin/sync'
import { usePains } from '../journal/pains'
import { isRun } from '../running/running'
import { useActivities } from './activities'
import { weekReport } from './weekReport'

type Which = 'this' | 'last'

const TITLE = 'Relatório da semana para o treinador'

function ReportModal({ today, onClose }: { today: DayKey; onClose: () => void }) {
  const toast = useToast()
  const activities = useActivities()
  const events = usePlannedEvents()
  const past = useLiveQuery(pastEvents)
  const pains = usePains()
  const thisWeek = weekStart(today)
  const lastWeek = shiftDay(thisWeek, -7)
  const eventTimes = useEventTimes(lastWeek, shiftDay(thisWeek, 6))
  const [which, setWhich] = useState<Which>()
  const field = useRef<HTMLTextAreaElement>(null)

  // Until the first run of the week there is nothing to tell about it yet: last week comes first.
  const ranThisWeek = !!activities?.some((activity) => activity.date >= thisWeek && isRun(activity))
  const chosen = which ?? (ranThisWeek ? 'this' : 'last')
  const text = useMemo(() => {
    if (!activities || events === undefined || !past || !pains || !eventTimes) return undefined
    return weekReport({
      week: chosen === 'this' ? thisWeek : lastWeek,
      today,
      activities,
      events: withPastEvents(past, events),
      eventTimes,
      pains,
    })
  }, [chosen, thisWeek, lastWeek, today, activities, events, past, eventTimes, pains])

  const copy = async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast({ message: 'Copiado. É só colar na mensagem para o treinador.' })
    } catch {
      // Some WebViews block the clipboard: the text is selected to copy by hand.
      field.current?.focus()
      field.current?.select()
      toast({ message: 'O celular bloqueou a cópia: o texto está selecionado para copiar.' })
    }
  }
  const share = async () => {
    if (!text) return
    try {
      if ((await shareText(text, TITLE)) === 'copied') toast({ message: 'Copiado. É só colar na mensagem para o treinador.' })
    } catch (error) {
      toast({ message: `Não deu para compartilhar: ${error instanceof Error ? error.message : String(error)}` })
    }
  }

  return (
    <Modal open title={TITLE} onClose={onClose}>
      <Segmented
        label="Qual semana"
        value={chosen}
        onChange={setWhich}
        options={[
          { value: 'this', label: 'Esta semana' },
          { value: 'last', label: 'Semana passada' },
        ]}
      />
      <div className="mt-3">
        {text === undefined ? (
          <SkeletonLines lines={6} />
        ) : (
          <textarea
            ref={field}
            readOnly
            rows={14}
            value={text}
            aria-label="Texto do relatório"
            className="w-full resize-y rounded-xl border border-line bg-surface p-3 text-sm text-ink"
          />
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" disabled={!text} onClick={() => void copy()}>
          <ClipboardCopy size={16} /> Copiar
        </Button>
        <Button variant="primary" className="flex-1" disabled={!text} onClick={() => void share()}>
          <Share2 size={16} /> Compartilhar
        </Button>
      </div>
    </Modal>
  )
}

/** In Corrida's "Esta semana": the week's report for the coach (this week or the last), to copy or share. */
export function CoachReportButton({ today }: { today: DayKey }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" className="mt-3 w-full" onClick={() => setOpen(true)}>
        <FileText size={16} /> Relatório para o treinador
      </Button>
      {open && <ReportModal today={today} onClose={() => setOpen(false)} />}
    </>
  )
}
