import { GlassWater, House, ListChecks, Scale, Settings } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { SyncStatus } from '../features/settings/SyncStatus'
import { cx } from './ui'

const NAV = [
  { to: '/', label: 'Hoje', icon: House },
  { to: '/corpo', label: 'Corpo', icon: Scale },
  { to: '/agua', label: 'Água', icon: GlassWater },
  { to: '/habitos', label: 'Hábitos', icon: ListChecks },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

export function Layout() {
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden border-r border-line bg-surface p-4 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col">
        <div className="mb-6 flex items-center gap-2 px-2 text-lg font-semibold">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-7" />
          Fitness
        </div>
        <nav className="space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition',
                  isActive ? 'text-accent-ink' : 'text-muted',
                )
              }
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
