import { defineConfig } from '@playwright/test'

const PORT = 5199

/**
 * The smoke test of the screens (e2e/). By default it runs against the build the Android app ships
 * (`npm run e2e` builds it into dist-e2e first): the same code as the site, with no service worker to
 * get between the test and the files. playwright.dev.config.ts runs it against the dev server instead.
 */
export default defineConfig({
  testDir: 'e2e',
  // Not *.test.ts or *.spec.ts: those are vitest's.
  testMatch: '**/*.e2e.ts',
  timeout: 300_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
