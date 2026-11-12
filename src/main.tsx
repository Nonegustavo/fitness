// First of all: it may have to put the address back before the router (in App) reads it.
import './ota/early'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startDailyInsights } from './features/analysis/daily'
import { startPhotoUploads } from './features/food/photos'
import { startGarminSync } from './features/garmin/sync'
import { startHealthConnectSync } from './features/healthconnect/sync'
import { startNotifications } from './features/notifications/native'
import { startWidgetSync } from './features/widget/sync'
import { watchFailures } from './lib/failures'
import { bundleStarted, switchBundle } from './ota/boot'
import { startSync } from './sync/controller'
import './index.css'

async function boot() {
  // In the Android app, a newer version already downloaded takes over here: the page reloads into it,
  // and this one starts nothing (no sync begun, no notification scheduled twice). Whatever goes wrong
  // with that, the app opens.
  if (await switchBundle().catch(() => false)) return

  watchFailures()
  startSync()
  startGarminSync()
  startHealthConnectSync()
  startNotifications()
  startWidgetSync()
  startPhotoUploads()
  startDailyInsights()
  // All data lives in IndexedDB first; ask the browser not to evict it under storage pressure.
  void navigator.storage?.persist?.()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  bundleStarted()
}

void boot()
