import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startGarminSync } from './features/garmin/sync'
import { startSync } from './sync/controller'
import './index.css'

startSync()
startGarminSync()
// All data lives in IndexedDB first; ask the browser not to evict it under storage pressure.
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
