import { lazy } from 'react'
import { createHashRouter, Navigate, RouterProvider, useRouteError } from 'react-router'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { Button } from './components/ui'
import TodayPage from './features/today/TodayPage'

// Hash routing works the same on GitHub Pages, in the installed PWA and later inside Capacitor.
const BodyPage = lazy(() => import('./features/body/BodyPage'))
const WaterPage = lazy(() => import('./features/water/WaterPage'))
const HabitsPage = lazy(() => import('./features/habits/HabitsPage'))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'))

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'corpo', element: <BodyPage /> },
      { path: 'agua', element: <WaterPage /> },
      { path: 'habitos', element: <HabitsPage /> },
      { path: 'ajustes', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

/** Usually a page chunk that changed after an app update; reloading fetches the new one. */
function RouteError() {
  const error = useRouteError()
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-sm text-ink-2">Pode ser uma atualização do app. Recarregar costuma resolver.</p>
      <Button variant="primary" className="mt-6" onClick={() => location.reload()}>
        Recarregar
      </Button>
      <p className="mt-6 text-xs break-words text-muted">{error instanceof Error ? error.message : String(error)}</p>
    </div>
  )
}

export function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  )
}
