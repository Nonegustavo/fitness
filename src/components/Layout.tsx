import { Ellipsis } from 'lucide-react'
import { Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router'
import { SyncStatus } from '../features/settings/SyncStatus'
import { Celebrations } from '../features/streaks/Celebrations'
import { RestTimerBar } from '../features/training/RestTimerBar'
import { useSettings } from '../db/hooks'
import { QuickLogButton } from './QuickLog'
import { bottomSections, SECTIONS } from './sections'
import { toneColor, toneStyle } from './tone'
import { cx } from './ui'

const bottomClass = (active: boolean) =>
  cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition', active ? 'text-accent-ink' : 'text-muted')

// The app manages the scroll itself: the browser's own restoring would fight the reset below.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

declare global {
  interface Window {
    /** Asked by the Android app before going back: "handled" when it closed an open sheet instead. */
    fitnessBack?: () => 'handled' | 'none'
  }
}

window.fitnessBack = () => {
  if (!document.querySelector('[role="dialog"]')) return 'none'
  // The sheets close on Escape, the innermost first.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  return 'handled'
}

/** Scrolls to `y`, again for a moment while the page is still too short (its data loading). */
function scrollBackTo(y: number) {
  let tries = 0
  const attempt = () => {
    window.scrollTo(0, y)
    if (Math.abs(window.scrollY - y) > 2 && tries++ < 20) setTimeout(attempt, 50)
  }
  attempt()
}

/**
 * A new screen opens at its top (all screens share the page's scroll, so otherwise one kept the
 * position of the last); going back returns to where that screen was left. Changes within a
 * screen (?dia=, ?refeicao=) keep the position.
 */
function useScrollPerScreen() {
  const location = useLocation()
  const navigation = useNavigationType()
  const positions = useRef(new Map<string, number>())
  const current = useRef({ key: location.key, pathname: location.pathname, y: 0 })

  useEffect(() => {
    const onScroll = () => {
      current.current.y = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    const previous = current.current
    if (previous.key === location.key) return
    positions.current.set(previous.key, previous.y)
    current.current = { key: location.key, pathname: location.pathname, y: 0 }
    const saved = navigation === 'POP' ? positions.current.get(location.key) : undefined
    if (saved !== undefined) scrollBackTo(saved)
    else if (previous.pathname !== location.pathname) window.scrollTo(0, 0)
  }, [location.key, location.pathname, navigation])
}

export function Layout() {
  const { pathname } = useLocation()
  const settings = useSettings()
  // The four sections the user put on the bottom bar; the rest live under "Mais".
  const bottom = bottomSections(settings.navBar)
  // Screens reached from "Mais" that aren't sections of their own (Passos, the week's summary) count too.
  const underMore = ['/mais', '/passos', '/semana', ...SECTIONS.filter((section) => !bottom.includes(section)).map((section) => section.to)]
  const inMore = underMore.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  useScrollPerScreen()

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
      <Celebrations />

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {bottom.map(({ to, label, short, icon: Icon, tone }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => bottomClass(isActive)}
              style={({ isActive }) => (isActive ? { color: toneColor(tone) } : undefined)}
            >
              <Icon size={22} />
              {short ?? label}
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
