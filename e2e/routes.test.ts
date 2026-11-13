import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { screens } from './routes'

/** The route paths of src/App.tsx, as written there ("treinos/ficha/:id"; "/" for the first screen). */
function appRoutes(): string[] {
  const source = readFileSync(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8')
  const paths = [...source.matchAll(/path: '([^']+)'/g)].map((match) => match[1])
  // The layout's own "/" is the first screen (its index route); "*" only sends strangers back to it.
  return paths.filter((path) => path !== '*')
}

describe('the smoke test', () => {
  it('opens every route of the app', () => {
    const covered = new Set(screens({ template: 't', session: 's', exercise: 'e', run: 'r', strength: 'g' }).map((screen) => screen.route))
    const missing = appRoutes().filter((path) => !covered.has(path))
    // A new screen goes into e2e/routes.ts, so it is opened at the phone's width and at the computer's.
    expect(missing).toEqual([])
  })

  it('knows no route the app has dropped', () => {
    const routes = new Set(appRoutes())
    const stale = screens({ template: 't', session: 's', exercise: 'e', run: 'r', strength: 'g' }).filter((screen) => !routes.has(screen.route))
    expect(stale).toEqual([])
  })
})
