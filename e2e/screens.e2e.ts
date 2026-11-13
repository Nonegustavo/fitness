import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { screens } from './routes'
import { buildSeed } from './seed'
import { forecastAnswer } from './weather'

/**
 * Opens every screen of the app with a few weeks of made-up data, at the phone's width and at the
 * computer's, and fails on what has slipped through before: an error on the page, something wider
 * than the screen (which on the phone pushes the bottom bar out of view), a screen that never shows.
 */

const seed = buildSeed()

const SIZES = [
  { name: 'celular (375 px)', viewport: { width: 375, height: 812 }, phone: true },
  { name: 'computador (1280 px)', viewport: { width: 1280, height: 800 }, phone: false },
  { name: 'monitor largo (1920 px)', viewport: { width: 1920, height: 1080 }, phone: false },
]

/** Console noise that isn't the app's doing: requests the test refuses on purpose. */
const IGNORED = [/Failed to load resource/, /net::ERR_/, /ERR_FAILED/]

async function offline(context: BrowserContext) {
  // Nothing leaves the machine: the forecast gets a fixed answer, everything else outside is refused
  // (map tiles, exercise pictures, the server).
  await context.route(
    (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
    (route) =>
      route.request().url().includes('api.open-meteo.com/v1/forecast')
        ? route.fulfill({ json: forecastAnswer() })
        : route.abort(),
  )
}

/**
 * The app is drawn in the system's font, and CI's Linux has a wider one than Windows or Android.
 * `E2E_FONT=Verdana npm run e2e` tries a wide font on this machine, before CI finds out.
 */
const FONT = process.env.E2E_FONT

async function importSeed(page: Page) {
  await page.goto('/#/ajustes?secao=backup')
  if (FONT) await page.addStyleTag({ content: `:root, button, input, select, textarea { font-family: ${FONT}, sans-serif !important }` })
  await page
    .locator('input[type="file"][accept*="json"]')
    .setInputFiles({ name: 'dados-de-teste.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed.file)) })
  await expect(page.getByText(/registros importados/)).toBeVisible({ timeout: 30_000 })
}

/** Waits for the screen to be on: its title drawn and the page past its fade-in. */
async function shown(page: Page) {
  await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 15_000 })
  // The page stays see-through until its data is there (useReveal); other things are see-through for
  // good (a segmented control's pill, a picture that never loads here), so only the title's page counts.
  await page.waitForFunction(
    () => {
      const title = document.querySelector('main h1')
      return !!title && !title.closest('.opacity-0')
    },
    undefined,
    { timeout: 15_000 },
  )
  // A beat for the cards that read after the first paint (charts, live queries).
  await page.waitForTimeout(350)
}

/** What on the page reaches past the screen's right edge, when the page itself has grown wider than it. */
function overflow(page: Page) {
  return page.evaluate(() => {
    // The layout clips sideways overflow so nothing can widen the page; undo that to see what would have.
    const root = document.querySelector<HTMLElement>('[data-screen]')
    if (root) root.style.overflowX = 'visible'
    // The pagers keep the neighbouring day or tab drawn off to the side, out of reach: not an overflow.
    const hidden = [...document.querySelectorAll<HTMLElement>('[inert]')]
    for (const element of hidden) element.style.display = 'none'
    const width = document.documentElement.clientWidth
    const page = document.documentElement.scrollWidth
    const scrolls = (element: Element | null): boolean => {
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && node !== root) return true
      }
      return false
    }
    const culprits =
      page <= width + 1
        ? []
        : [...document.querySelectorAll<HTMLElement>('main *, nav *, [role="dialog"] *')]
            .filter((element) => {
              const box = element.getBoundingClientRect()
              return box.width > 0 && box.right > width + 1 && !scrolls(element.parentElement)
            })
            .slice(0, 4)
            .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 80)}`)
    for (const element of hidden) element.style.display = ''
    if (root) root.style.overflowX = ''
    return { page, width, culprits }
  })
}

for (const size of SIZES) {
  test(`todas as telas: ${size.name}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: size.viewport,
      hasTouch: size.phone,
      isMobile: size.phone,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      // The fades and slides are skipped: what is checked is what the screens end up as.
      reducedMotion: 'reduce',
    })
    await offline(context)
    const page = await context.newPage()
    let current = 'importar os dados'
    const problems: string[] = []
    page.on('pageerror', (error) => problems.push(`${current}: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      if (!IGNORED.some((pattern) => pattern.test(text))) problems.push(`${current}: console: ${text}`)
    })

    await importSeed(page)

    for (const { address } of screens(seed.ids)) {
      current = address
      await test.step(address, async () => {
        await page.goto(`/#${address}`)
        await shown(page)
        // The app's own error screen (a route that threw) has no layout around it.
        expect.soft(await page.getByText('Algo deu errado').count(), `${address}: a tela de erro apareceu`).toBe(0)
        const wide = await overflow(page)
        expect.soft(wide.page, `${address}: a página ficou mais larga que a tela (${wide.culprits.join(' | ')})`).toBeLessThanOrEqual(wide.width + 1)
        if (size.phone) {
          // The bottom bar sits at the bottom of the screen, wherever the page is.
          const bar = await page.locator('nav.fixed').boundingBox()
          expect.soft(bar && Math.round(bar.y + bar.height), `${address}: a barra de baixo saiu do lugar`).toBe(size.viewport.height)
          expect.soft(bar && Math.round(bar.width), `${address}: a barra de baixo não tem a largura da tela`).toBe(size.viewport.width)
        }
      })
    }

    expect.soft(problems, 'erros nas telas').toEqual([])
    await context.close()
  })
}
