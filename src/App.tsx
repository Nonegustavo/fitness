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
const TrainingPage = lazy(() => import('./features/training/TrainingPage'))
const TemplateEditor = lazy(() => import('./features/training/TemplateEditor'))
const SessionPage = lazy(() => import('./features/training/SessionPage'))
const ExercisesPage = lazy(() => import('./features/training/ExercisesPage'))
const ExerciseDetail = lazy(() => import('./features/training/ExerciseDetail'))
const ActivitiesPage = lazy(() => import('./features/activities/ActivitiesPage'))
const ActivityPage = lazy(() => import('./features/activities/ActivityPage'))
const SleepPage = lazy(() => import('./features/garmin/SleepPage'))
const InsightsPage = lazy(() => import('./features/insights/InsightsPage'))
const JournalPage = lazy(() => import('./features/journal/JournalPage'))
const AnalysisPage = lazy(() => import('./features/analysis/AnalysisPage'))
const FoodPage = lazy(() => import('./features/food/FoodPage'))
const AddFoodPage = lazy(() => import('./features/food/AddFoodPage'))
const MorePage = lazy(() => import('./features/more/MorePage'))
const CalendarPage = lazy(() => import('./features/calendar/CalendarPage'))
const StepsPage = lazy(() => import('./features/garmin/StepsPage'))
const RecordsPage = lazy(() => import('./features/running/RecordsPage'))
const RunningPage = lazy(() => import('./features/running/RunningPage'))
const CaloriesPage = lazy(() => import('./features/garmin/CaloriesPage'))

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'treinos', element: <TrainingPage /> },
      { path: 'treinos/ficha/:id', element: <TemplateEditor /> },
      { path: 'treinos/sessao/:id', element: <SessionPage /> },
      { path: 'treinos/exercicios', element: <ExercisesPage /> },
      { path: 'treinos/exercicios/:id', element: <ExerciseDetail /> },
      { path: 'treinos/atividades', element: <ActivitiesPage /> },
      { path: 'treinos/atividades/:id', element: <ActivityPage /> },
      { path: 'calendario', element: <CalendarPage /> },
      { path: 'corrida', element: <RunningPage /> },
      { path: 'corrida/recordes', element: <RecordsPage /> },
      { path: 'recordes', element: <Navigate to="/corrida/recordes" replace /> },
      { path: 'passos', element: <StepsPage /> },
      { path: 'calorias', element: <CaloriesPage /> },
      { path: 'alimentacao', element: <FoodPage /> },
      { path: 'alimentacao/adicionar', element: <AddFoodPage /> },
      { path: 'corpo', element: <BodyPage /> },
      { path: 'sono', element: <SleepPage /> },
      { path: 'correlacoes', element: <InsightsPage /> },
      { path: 'diario', element: <JournalPage /> },
      { path: 'analise', element: <AnalysisPage /> },
      { path: 'mais', element: <MorePage /> },
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
