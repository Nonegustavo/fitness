import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '../../components/Toast'
import { Button } from '../../components/ui'
import type { Activity, ActivityStream, Exercise, WorkoutSession } from '../../db/types'
import { shareFile } from '../../lib/share'
import { activityCard, drawCard, gymCard, type ShareCard } from './shareCard'

/** Draws the card and hands it to the share sheet (or the downloads, in a browser without one). */
function useShareCard() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const share = async (card: () => ShareCard, fileName: string, title: string) => {
    if (busy) return
    setBusy(true)
    try {
      const outcome = await shareFile(await drawCard(card()), fileName, title)
      if (outcome === 'downloaded') toast({ message: 'Imagem salva nos downloads.' })
    } catch (error) {
      toast({ message: `Não deu para compartilhar: ${error instanceof Error ? error.message : String(error)}` })
    } finally {
      setBusy(false)
    }
  }
  return { busy, share }
}

/** "Compartilhar" on an activity: a 1080×1350 image with its numbers and the route. */
export function ShareActivityButton({ activity, stream }: { activity: Activity; stream?: ActivityStream | null }) {
  const { busy, share } = useShareCard()
  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={() => void share(() => activityCard(activity, stream), `atividade-${activity.date}.png`, activity.title ?? 'Atividade')}
    >
      <Share2 size={16} /> Compartilhar
    </Button>
  )
}

/** "Compartilhar" on a finished gym workout: its numbers, records and the exercises that stood out. */
export function ShareSessionButton({
  session,
  exercises,
  records,
}: {
  session: WorkoutSession
  exercises: Map<string, Exercise>
  records: Set<string>
}) {
  const { busy, share } = useShareCard()
  return (
    <Button
      size="sm"
      className="mt-3 w-full"
      disabled={busy}
      onClick={() => void share(() => gymCard(session, exercises, records), `treino-${session.date}.png`, session.name)}
    >
      <Share2 size={16} /> Compartilhar
    </Button>
  )
}
