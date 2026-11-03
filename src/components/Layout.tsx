import { Dumbbell, Ellipsis, GlassWater, House, ListChecks, Scale, Settings, Utensils } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { SyncStatus } from '../features/settings/SyncStatus'
import { RestTimerBar } from '../features/training/RestTimerBar'
import { cx } from './ui'

/** Every section, as the desktop sidebar lists them. */
const SECTIONS = [
  { to: '/', label: 'Hoje', icon: House },
  { to: '/treinos', label: 'Treinos', icon: Dumbbell },
  { to: '/alimentacao', label: 'Alimentação', icon: Utensils },
  { to: '/corpo', label: 'Corpo', icon: Scale },
  { to: '/agua', label: 'Água', icon: GlassWater },
  { to: '/habitos', label: 'Hábitos', icon: ListChecks },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

// The phone's bottom bar fits five: the first four sections, then "Mais" for the rest.
const BOTTOM = SECTIONS.slice(0, 4)
const UNDER_MORE = ['/mais', ...SECTIONS.slice(4).map((section) => section.to)]

const bottomClass = (active: boolean) =>
  cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition', active ? 'text-accent-ink' : 'text-muted')

export function Layout() {
  const { pathname } = useLocation()
  const inMore = UNDER_MORE.some((path) => pathname === path || pathname.startsWith(`${path}/`))

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden border-r border-line bg-surface p-4 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col">
        <div className="mb-6 flex items-center gap-2 px-2 text-lg font-semibold">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-7" />
          Fitness
        </div>
        <nav className="space-y-1">
          {SECTIONS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2',
                )
              }
            >
              <Icon size={18} />
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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {BOTTOM.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => bottomClass(isActive)}>
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
