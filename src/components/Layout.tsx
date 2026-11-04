import {
  CalendarDays,
  ChartScatter,
  Dumbbell,
  Ellipsis,
  GlassWater,
  House,
  ListChecks,
  Moon,
  NotebookPen,
  Scale,
  Settings,
  Sparkles,
  Utensils,
} from 'lucide-react'
import { Suspense, useLayoutEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { SyncStatus } from '../features/settings/SyncStatus'
import { RestTimerBar } from '../features/training/RestTimerBar'
import { QuickLogButton } from './QuickLog'
import { toneColor, toneStyle, type Tone } from './tone'
import { cx } from './ui'

/** Every section, as the desktop sidebar lists them, each with its color. */
const SECTIONS: { to: string; label: string; icon: typeof House; tone: Tone }[] = [
  { to: '/', label: 'Hoje', icon: House, tone: 'today' },
  { to: '/treinos', label: 'Treinos', icon: Dumbbell, tone: 'training' },
  { to: '/calendario', label: 'Calendário', icon: CalendarDays, tone: 'training' },
  { to: '/alimentacao', label: 'Alimentação', icon: Utensils, tone: 'food' },
  { to: '/corpo', label: 'Corpo', icon: Scale, tone: 'body' },
  { to: '/sono', label: 'Sono', icon: Moon, tone: 'sleep' },
  { to: '/analise', label: 'Análise', icon: Sparkles, tone: 'analysis' },
  { to: '/correlacoes', label: 'Correlações', icon: ChartScatter, tone: 'insights' },
  { to: '/agua', label: 'Água', icon: GlassWater, tone: 'water' },
  { to: '/habitos', label: 'Hábitos', icon: ListChecks, tone: 'habits' },
  { to: '/diario', label: 'Diário', icon: NotebookPen, tone: 'journal' },
  { to: '/ajustes', label: 'Ajustes', icon: Settings, tone: 'settings' },
]

// The phone's bottom bar fits five: these four sections, then "Mais" for the rest.
const BOTTOM_PATHS = ['/', '/treinos', '/alimentacao', '/corpo']
const BOTTOM = SECTIONS.filter((section) => BOTTOM_PATHS.includes(section.to))
const UNDER_MORE = ['/mais', ...SECTIONS.filter((section) => !BOTTOM_PATHS.includes(section.to)).map((section) => section.to)]

const bottomClass = (active: boolean) =>
  cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition', active ? 'text-accent-ink' : 'text-muted')

// The app manages the scroll itself: the browser's own restoring would fight the reset below.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

export function Layout() {
  const { pathname } = useLocation()
  const inMore = UNDER_MORE.some((path) => pathname === path || pathname.startsWith(`${path}/`))

  // Every screen opens at its top. All screens share the page's scroll, so without this one kept
  // the position of the last. Changes within a screen (?dia=, ?refeicao=) keep where it is.
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    // Nothing may widen the screen sideways: on a phone that also pushed the bottom bar out of view.
    <div className="min-h-dvh overflow-x-clip lg:flex">
      <aside className="hidden border-r border-line bg-surface p-4 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col">
        <div className="mb-6 flex items-center gap-2 px-2 text-lg font-semibold">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-7" />
          Fitness
        </div>
        <QuickLogButton variant="sidebar" />
        <nav className="space-y-1">
          {SECTIONS.map(({ to, label, icon: Icon, tone }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                  isActive ? 'text-ink' : 'text-ink-2 hover:bg-surface-2',
                )
              }
              style={({ isActive }) => (isActive ? { background: toneStyle(tone, 12).background } : undefined)}
            >
              <Icon size={18} style={{ color: toneColor(tone) }} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs">
          <SyncStatus />
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </main>

      <RestTimerBar />
      <QuickLogButton variant="floating" />

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {BOTTOM.map(({ to, label, icon: Icon, tone }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => bottomClass(isActive)}
              style={({ isActive }) => (isActive ? { color: toneColor(tone) } : undefined)}
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
          <NavLink to="/mais" className={bottomClass(inMore)} aria-current={inMore ? 'page' : undefined}>
            <Ellipsis size={22} />
            Mais
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
