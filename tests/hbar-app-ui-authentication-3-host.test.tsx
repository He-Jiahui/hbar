import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { basename, resolve } from 'node:path'
import { chromium, expect as playwrightExpect, type Browser, type Page } from '@playwright/test'
import type { Authentication3BrowserHarness } from './fixtures/authentication3-host-browser'

declare global {
  interface Window {
    __authentication3Test?: Authentication3BrowserHarness | undefined
  }
}

let server: ReturnType<typeof Bun.serve> | undefined
let browser: Browser | undefined
let page: Page | undefined
const errors: string[] = []

function requiredPage(): Page {
  if (!page) throw new Error('Authentication 3 host browser did not start')
  return page
}

beforeAll(async () => {
  const build = await Bun.build({
    entrypoints: [resolve(import.meta.dir, 'fixtures/authentication3-host-browser.tsx')],
    target: 'browser',
    format: 'esm',
  })
  if (!build.success) throw new Error(build.logs.map((log) => log.message).join('\n'))
  const assets = new Map(build.outputs.map((output) => [basename(output.path), output]))
  const entry = [...assets.keys()].find((name) => name.endsWith('.js'))
  if (!entry) throw new Error('Authentication 3 fixture emitted no JavaScript entrypoint')
  const styles = [...assets.keys()].filter((name) => name.endsWith('.css'))
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">${styles.map((name) => `<link rel="stylesheet" href="/assets/${encodeURIComponent(name)}">`).join('')}</head><body><div id="root"></div><script type="module" src="/assets/${encodeURIComponent(entry)}"></script></body></html>`
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname
      if (pathname === '/') return new Response(html, { headers: { 'content-type': 'text/html' } })
      const asset = assets.get(decodeURIComponent(pathname.slice('/assets/'.length)))
      if (!asset) return new Response('Not found', { status: 404 })
      const contentType = pathname.endsWith('.js')
        ? 'text/javascript'
        : pathname.endsWith('.css')
          ? 'text/css'
          : asset.type
      return new Response(asset, { headers: { 'content-type': contentType } })
    },
  })
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  })
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.clock.install({ time: new Date('2026-09-29T00:00:00.000Z') })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`)
  })
  await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__authentication3Test !== undefined)
}, 30_000)

afterAll(async () => {
  try {
    await page?.close()
  } finally {
    try {
      await browser?.close()
    } finally {
      await server?.stop(true)
    }
  }
}, 30_000)

describe('Authentication 3 public host integration', () => {
  test('retains drafts across locale changes, reconciles quote data, and logs no password', async () => {
    const activePage = requiredPage()
    const inherited = activePage.locator('[data-auth3-controlled]')
    const email = activePage.locator('[data-auth3-field="email"]')
    const password = activePage.locator('[data-auth3-field="password"]')
    expect(await inherited.getAttribute('data-auth3-inherited-title')).toBe('Parent sign-in contract')
    expect(await inherited.getAttribute('data-auth3-controlled')).toBe('true')
    expect(await activePage.locator('[data-auth3-quote="mina"] blockquote').count()).toBe(1)
    expect(await password.inputValue()).toBe('')

    await email.fill('draft@example.invalid')
    await password.fill('NeverLogThis-9!')
    await activePage.getByRole('button', { name: 'Show password', exact: true }).click()
    expect(await password.getAttribute('type')).toBe('text')

    await activePage.locator('[data-auth3-action="previous-quote"]').click()
    expect(await inherited.getAttribute('data-auth3-quote-id')).toBe('rachel')
    await activePage.locator('[data-auth3-action="next-quote"]').click()
    expect(await inherited.getAttribute('data-auth3-quote-id')).toBe('mina')
    await activePage.getByRole('button', { name: 'Show quote from Daniel Osei', exact: true }).click()
    expect(await inherited.getAttribute('data-auth3-quote-id')).toBe('daniel')

    await activePage.evaluate(() => window.__authentication3Test?.configure({ locale: 'de' }))
    await playwrightExpect(activePage.getByRole('heading', { name: 'Anmelden', exact: true })).toHaveCount(1)
    expect(await email.inputValue()).toBe('draft@example.invalid')
    expect(await password.inputValue()).toBe('NeverLogThis-9!')
    expect(await password.getAttribute('type')).toBe('text')
    expect(await inherited.getAttribute('data-auth3-quote-id')).toBe('daniel')

    await activePage.evaluate(() => window.__authentication3Test?.clearActions())
    await password.press('Enter')
    const actions = await activePage.evaluate(() => window.__authentication3Test?.actions() ?? [])
    expect(actions).toHaveLength(1)
    expect(actions[0]?.variantId).toBe('hbar-app-ui-authentication-3')
    expect(actions[0]?.actionId).toBe('request-authentication-sign-in')
    expect(JSON.parse(actions[0]?.value ?? '{}')).toEqual({
      kind: 'sign-in-request',
      email: 'draft@example.invalid',
      quoteId: 'daniel',
      outcome: 'authentication-and-navigation-unverified',
    })
    expect(JSON.stringify(actions)).not.toContain('NeverLogThis-9!')
    expect(await activePage.locator('[data-auth3-action="sign-in"]').count()).toBe(2)

    await activePage.evaluate(() => window.__authentication3Test?.configure({ dropDaniel: true }))
    await playwrightExpect(inherited).toHaveAttribute('data-auth3-quote-id', 'mina')
    expect(await email.inputValue()).toBe('draft@example.invalid')
    expect(await password.inputValue()).toBe('NeverLogThis-9!')

    await activePage.evaluate(() => window.__authentication3Test?.configure({ capacity: 'empty', locale: 'en' }))
    await playwrightExpect(inherited).toHaveAttribute('data-auth3-quote-id', 'empty')
    expect(await activePage.getByText('No customer stories yet.', { exact: true }).count()).toBe(1)
    expect(await activePage.locator('.hbar-app-ui-auth-quote-dots > button').count()).toBe(0)
    expect(await email.inputValue()).toBe('dana.whitfield@northwind.com')
    expect(await password.inputValue()).toBe('')
    expect(await password.getAttribute('type')).toBe('password')
  }, 20_000)

  test('retains source, boundary, quote overflow, metric overflow, and wrong-variant pass-through', async () => {
    const activePage = requiredPage()
    const providerButtons = activePage.locator('.hbar-app-ui-auth-provider-buttons > button')
    const quoteDots = activePage.locator('.hbar-app-ui-auth-quote-dots > button')

    await activePage.evaluate(() =>
      window.__authentication3Test?.configure({
        capacity: 'source',
        locale: 'en',
        dropDaniel: false,
        messyIds: false,
        metricCapacity: 'source',
      }),
    )
    expect(await providerButtons.count()).toBe(3)
    expect(await providerButtons.nth(0).innerText()).toBe('Google')
    expect(await providerButtons.nth(1).innerText()).toBe('Apple')
    expect(await providerButtons.nth(2).innerText()).toBe('GitHub')
    expect(await quoteDots.count()).toBe(3)

    await activePage.evaluate(() => window.__authentication3Test?.configure({ messyIds: true }))
    expect(await providerButtons.count()).toBe(3)
    expect(await quoteDots.count()).toBe(3)
    await activePage.getByRole('button', { name: 'Show quote from Daniel Osei', exact: true }).click()
    expect(await activePage.locator('[data-auth3-quote-id]').getAttribute('data-auth3-quote-id')).toBe('daniel')

    await activePage.evaluate(() => window.__authentication3Test?.configure({ capacity: 'boundary', messyIds: false }))
    expect(await providerButtons.count()).toBe(6)
    expect(await quoteDots.count()).toBe(6)

    await activePage.evaluate(() => window.__authentication3Test?.configure({ capacity: 'overflow' }))
    expect(await providerButtons.count()).toBe(17)
    expect(await quoteDots.count()).toBe(17)
    expect(await activePage.getByRole('button', { name: 'Continue with provider 17', exact: true }).count()).toBe(1)
    expect(await activePage.getByRole('button', { name: 'Show quote from Host story 17', exact: true }).count()).toBe(1)
    expect(
      await activePage.locator('.hbar-app-ui-auth-provider-buttons').getAttribute('data-hbar-app-ui-list-strategy'),
    ).toBe('content-grown')

    await activePage.evaluate(() =>
      window.__authentication3Test?.configure({ capacity: 'source', metricCapacity: 'overflow' }),
    )
    expect(await activePage.locator('.hbar-app-ui-auth-quote-metric').count()).toBe(17)
    expect(await activePage.getByText('Additional metric 14', { exact: true }).count()).toBe(1)

    await activePage.evaluate(() => window.__authentication3Test?.configure({ variant: 1 }))
    expect(await activePage.locator('[data-auth3-controlled="false"]').count()).toBe(1)
    expect(errors).toEqual([])
  }, 20_000)

  test('keeps timer cadence across drafts and copy, disposes stale owners, and rejects unsafe intervals', async () => {
    const activePage = requiredPage()
    const email = activePage.locator('[data-auth3-field="email"]')
    const password = activePage.locator('[data-auth3-field="password"]')

    await activePage.evaluate(() =>
      window.__authentication3Test?.configure({
        variant: 3,
        capacity: 'source',
        locale: 'en',
        autoAdvanceMs: 1_000,
        dropDaniel: false,
        messyIds: false,
      }),
    )
    expect(await activePage.evaluate(() => window.__authentication3Test?.activeIntervals() ?? 0)).toBe(1)
    const ticksBeforeCopyAndDraft = await activePage.evaluate(() => window.__authentication3Test?.intervalTicks() ?? 0)
    await activePage.clock.fastForward(400)
    await email.fill('timer@example.invalid')
    await password.fill('TimerSecret-7!')
    await activePage.evaluate(() => window.__authentication3Test?.configure({ locale: 'de' }))
    expect(await activePage.evaluate(() => window.__authentication3Test?.activeIntervals() ?? 0)).toBe(1)
    await activePage.clock.fastForward(700)
    expect(await activePage.evaluate(() => window.__authentication3Test?.intervalTicks() ?? 0)).toBe(
      ticksBeforeCopyAndDraft + 1,
    )
    expect(await activePage.locator('[data-auth3-quote-id]').getAttribute('data-auth3-quote-id')).toBe('daniel')
    expect(await email.inputValue()).toBe('timer@example.invalid')
    expect(await password.inputValue()).toBe('TimerSecret-7!')

    const currentTicks = await activePage.evaluate(() => window.__authentication3Test?.intervalTicks() ?? 0)
    await activePage.evaluate(() => window.__authentication3Test?.configure({ autoAdvanceMs: 0 }))
    expect(await activePage.evaluate(() => window.__authentication3Test?.activeIntervals() ?? 0)).toBe(0)
    await activePage.evaluate(() =>
      window.__authentication3Test?.configure({ autoAdvanceMs: Number.POSITIVE_INFINITY }),
    )
    expect(await activePage.evaluate(() => window.__authentication3Test?.activeIntervals() ?? 0)).toBe(0)
    await activePage.evaluate(() => window.__authentication3Test?.configure({ autoAdvanceMs: 2_147_483_648 }))
    expect(await activePage.evaluate(() => window.__authentication3Test?.activeIntervals() ?? 0)).toBe(0)
    await activePage.evaluate(() => window.__authentication3Test?.configure({ capacity: 'one', autoAdvanceMs: 1_000 }))
    expect(await activePage.evaluate(() => window.__authentication3Test?.activeIntervals() ?? 0)).toBe(0)
    await activePage.clock.fastForward(5_000)
    expect(await activePage.evaluate(() => window.__authentication3Test?.intervalTicks() ?? 0)).toBe(currentTicks)

    await activePage.evaluate(() =>
      window.__authentication3Test?.configure({ capacity: 'source', autoAdvanceMs: 1_000 }),
    )
    expect(await activePage.evaluate(() => window.__authentication3Test?.activeIntervals() ?? 0)).toBe(1)
    await activePage.evaluate(() => window.__authentication3Test?.captureCurrentSignInRequest())
    await activePage.evaluate(() => window.__authentication3Test?.clearActions())
    await password.fill('OwnerSecret-3!')
    await activePage.evaluate(() => window.__authentication3Test?.configure({ capacity: 'empty' }))
    expect(await activePage.evaluate(() => window.__authentication3Test?.activeIntervals() ?? 0)).toBe(0)
    expect(await password.inputValue()).toBe('')
    await activePage.evaluate(() => window.__authentication3Test?.invokeCapturedSignInRequest())
    expect(await activePage.evaluate(() => window.__authentication3Test?.actions() ?? [])).toHaveLength(0)

    await activePage.evaluate(() => window.__authentication3Test?.configure({ capacity: 'source' }))
    expect(await activePage.evaluate(() => window.__authentication3Test?.activeIntervals() ?? 0)).toBe(1)
    await activePage.evaluate(() => window.__authentication3Test?.captureCurrentSignInRequest())
    await activePage.evaluate(() => window.__authentication3Test?.configure({ variant: 1 }))
    expect(await activePage.evaluate(() => window.__authentication3Test?.activeIntervals() ?? 0)).toBe(0)
    const ticksBeforeUnmountAdvance = await activePage.evaluate(
      () => window.__authentication3Test?.intervalTicks() ?? 0,
    )
    await activePage.clock.fastForward(2_000)
    expect(await activePage.evaluate(() => window.__authentication3Test?.intervalTicks() ?? 0)).toBe(
      ticksBeforeUnmountAdvance,
    )
    await activePage.evaluate(() => window.__authentication3Test?.clearActions())
    await activePage.evaluate(() => window.__authentication3Test?.invokeCapturedSignInRequest())
    expect(await activePage.evaluate(() => window.__authentication3Test?.actions() ?? [])).toHaveLength(0)
    expect(errors).toEqual([])
  }, 20_000)
})
