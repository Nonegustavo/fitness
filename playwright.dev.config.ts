import { defineConfig } from '@playwright/test'
import base from './playwright.config'

const PORT = 5198

/**
 * The same smoke test against the dev server (`npm run e2e:dev`). In development the results of the
 * shared queries are frozen, so a screen that changes one in place throws here, where it happens,
 * instead of quietly changing what the other cards see.
 */
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
