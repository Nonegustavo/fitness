/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Output of a git command, or undefined where git (or the repository) isn't there. */
function git(...args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined
  } catch {
    return undefined
  }
}

// The build's identity: the commit, and its time, which orders versions (an APK built from a newer,
// unpushed commit is never "updated" back to an older published one). See src/ota.
const BUILD = git('rev-parse', '--short', 'HEAD') ?? 'dev'
const BUILD_TIME = Number(git('log', '-1', '--format=%ct')) || 0
/** The native level the web code needs from the APK (native-level.json; 1 when it can't be read). */
function minNative(): number {
  try {
    return Number(JSON.parse(readFileSync(new URL('./native-level.json', import.meta.url), 'utf8')).level) || 1
  } catch {
    return 1
  }
}

/** build.json in every build's output: what scripts/pack-android.mjs puts in the update manifest. */
const buildInfo = (): Plugin => ({
  name: 'build-info',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'build.json',
      source: JSON.stringify({ build: BUILD, time: BUILD_TIME, minNative: minNative() }),
    })
  },
})

// `--mode pages` builds for GitHub Pages, which serves the app under /fitness/.
// `--mode android` builds for the Capacitor app, which ships its files and needs no service worker.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/fitness/' : '/',
  define: {
    __BUILD__: JSON.stringify(BUILD),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [
    buildInfo(),
    react(),
    tailwindcss(),
    VitePWA({
      disable: mode === 'android',
      registerType: 'autoUpdate',
      pwaAssets: { image: 'public/icon.svg', preset: 'minimal-2023' },
      manifest: {
        name: 'Fitness',
        short_name: 'Fitness',
        description: 'Treinos, corpo, hábitos, alimentação e água em um só lugar.',
        lang: 'pt-BR',
        theme_color: '#0f766e',
        background_color: '#09090b',
        display: 'standalone',
        start_url: '.',
        shortcuts: [
          { name: 'Água', url: './#/agua' },
          { name: 'Registrar peso', url: './#/corpo?novo=peso' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
  build: {
    // ECharts alone is ~540 kB; it only loads with the pages that draw charts.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'node',
    // Worktrees of parallel sessions live under .claude/ and carry their own copy of the tests.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
}))
