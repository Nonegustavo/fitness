import { House, Settings, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Carousel } from '../../components/Carousel'
import { IconButton, Page } from '../../components/ui'
import { useSettings, useToday } from '../../db/hooks'
import { formatDay } from '../../lib/dates'
import { CustomizeHome } from './CustomizeHome'
import { ELEMENT_VIEWS } from './elements'
import { homeAreas } from './homeCards'
import { QuickGrid } from './tiles'

/**
 * The Hoje screen, like Garmin Connect's: "Em foco", big cards side by side to swipe through, and
 * "Visualização rápida", small cards two per row. Which elements go in each is up to the user.
 */
export default function TodayPage() {
  const today = useToday()
  const settings = useSettings()
  const [customizing, setCustomizing] = useState(false)
  const areas = homeAreas(settings)

  return (
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
      {areas.focus.length > 0 && (
        <div>
          <h2 className="mb-2 text-base font-semibold">Em foco</h2>
          <Carousel label="Em foco">
            {areas.focus.map((id) => {
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
  )
}
