import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startDailyInsights } from './features/analysis/daily'
import { startPhotoUploads } from './features/food/photos'
import { startGarminSync } from './features/garmin/sync'
import { startHealthConnectSync } from './features/healthconnect/sync'
import { startNotifications } from './features/notifications/native'
import { startWidgetSync } from './features/widget/sync'
import { startSync } from './sync/controller'
import './index.css'

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
