import { House, Settings, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Carousel } from '../../components/Carousel'
import { PullToRefresh } from '../../components/PullToRefresh'
import { useToast } from '../../components/Toast'
import { IconButton, Page } from '../../components/ui'
import { useNow, useSettings, useToday } from '../../db/hooks'
import { formatDay } from '../../lib/dates'
import { getSyncState, syncNow } from '../../sync/controller'
import { syncGarmin } from '../garmin/sync'
import { WeekCard } from '../calendar/cards'
import { RecapBanner } from '../recap/RecapBanner'
import { CustomizeHome } from './CustomizeHome'
import { ELEMENT_VIEWS } from './elements'
import { elementInfo, homeAreas, orderForTime } from './homeCards'
import { NowCard } from './NowCard'
import { QuickGrid } from './tiles'

/**
 * The Hoje screen, like Garmin Connect's: "Em foco", big cards side by side to swipe through, and
 * "Visualização rápida", small cards two per row. Which elements go in each is up to the user.
 */
export default function TodayPage() {
  const today = useToday()
  const settings = useSettings()
  const [customizing, setCustomizing] = useState(false)
  const toast = useToast()
  const areas = homeAreas(settings)
  // Checked every 10 minutes: enough for the order of "Em foco" to follow the time of day.
  const hour = useNow(600_000).getHours()
  const focus = areas.smartOrder ? orderForTime(areas.focus, hour) : areas.focus

  // Pulling the page down brings what's new from the server and from Garmin right away.
  const refresh = async () => {
    await Promise.allSettled([syncNow(), syncGarmin()])
    toast({ message: getSyncState().phase === 'error' ? 'Não deu para sincronizar agora.' : 'Atualizado.' })
  }

  return (
    <PullToRefresh onRefresh={refresh}>
    <Page
      title="Hoje"
      icon={House}
      tone="today"
      subtitle={formatDay(today)}
      actions={
        <>
          <IconButton label="Personalizar o Hoje" onClick={() => setCustomizing(true)}>
            <SlidersHorizontal size={20} />
          </IconButton>
          <Link
            to="/ajustes"
            aria-label="Ajustes"
            title="Ajustes"
            className="inline-flex size-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2 lg:hidden"
          >
            <Settings size={20} />
          </Link>
        </>
      }
    >
      <RecapBanner today={today} />
      {areas.now && <NowCard today={today} />}
      {areas.week && <WeekCard today={today} />}

      {focus.length > 0 && (
        <div>
          <h2 className="mb-2 text-base font-semibold">Em foco</h2>
          <Carousel
            label="Em foco"
            tabs={focus.map((id) => {
              const element = elementInfo(id)!
              return { icon: element.icon, tone: element.tone, label: element.label }
            })}
          >
            {focus.map((id) => {
              const Big = ELEMENT_VIEWS[id]?.big
              return Big && <Big key={id} today={today} />
            })}
          </Carousel>
        </div>
      )}

      {areas.quick.length > 0 && (
        <QuickGrid>
          {areas.quick.map((id) => {
            const Small = ELEMENT_VIEWS[id]?.small
            return Small && <Small key={id} today={today} />
          })}
        </QuickGrid>
      )}

      <button
        type="button"
        onClick={() => setCustomizing(true)}
        className="mx-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted hover:text-ink"
      >
        <SlidersHorizontal size={14} /> Escolher o que aparece aqui
      </button>

      {customizing && <CustomizeHome onClose={() => setCustomizing(false)} />}
    </Page>
    </PullToRefresh>
  )
}
