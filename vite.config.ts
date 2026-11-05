/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// `--mode pages` builds for GitHub Pages, which serves the app under /fitness/.
// `--mode android` builds for the Capacitor app, which ships its files and needs no service worker.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/fitness/' : '/',
  plugins: [
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
