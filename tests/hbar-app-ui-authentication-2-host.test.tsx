import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { basename, resolve } from 'node:path'
import { chromium, type Browser, type Page } from '@playwright/test'
import type { Authentication2BrowserHarness } from './fixtures/authentication2-host-browser'

declare global {
  interface Window {
    __authentication2Test?: Authentication2BrowserHarness | undefined
  }
}

let server: ReturnType<typeof Bun.serve> | undefined
let browser: Browser | undefined
let page: Page | undefined
const errors: string[] = []

function requiredPage() {
  if (!page) throw new Error('Authentication 2 host test browser did not start')
  return page
}

beforeAll(async () => {
  const build = await Bun.build({
    entrypoints: [resolve(import.meta.dir, 'fixtures/authentication2-host-browser.tsx')],
    target: 'browser',
    format: 'esm',
  })
  if (!build.success) throw new Error(build.logs.map((log) => log.message).join('\n'))
  const assets = new Map(build.outputs.map((output) => [basename(output.path), output]))
  const entry = [...assets.keys()].find((name) => name.endsWith('.js'))
  if (!entry) throw new Error('Authentication 2 fixture emitted no JavaScript entrypoint')
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
  page = await browser.newPage({ viewport: { width: 911, height: 640 } })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`)
  })
  await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__authentication2Test !== undefined)
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

describe('Authentication 2 public host integration', () => {
  test('owns independent drafts, retains them on translated copy changes, and emits one explicit request', async () => {
    const activePage = requiredPage()
    const toggle = activePage.locator('[data-auth2-action="toggle-mode"]')
    const submit = activePage.locator('[data-auth2-action="continue"]')
    const input = activePage.locator('[data-auth2-draft]')
    expect(await activePage.locator('[data-auth2-inherited-title]').getAttribute('data-auth2-inherited-title')).toBe(
      'Parent sign-in contract',
    )
    expect(await input.getAttribute('required')).toBeNull()
    expect(await submit.isDisabled()).toBe(true)
    await input.fill('invalid-email')
    expect(await submit.isDisabled()).toBe(true)
    await input.fill('audit@example.invalid')
    expect(await submit.isEnabled()).toBe(true)
    await toggle.focus()
    await toggle.press('Space')
    expect(await input.getAttribute('data-auth2-draft')).toBe('domain')
    expect(await input.inputValue()).toBe('')
    expect(await submit.isDisabled()).toBe(true)
    await input.fill('audit-team')
    expect(await submit.isEnabled()).toBe(true)
    await toggle.click()
    expect(await input.inputValue()).toBe('audit@example.invalid')
    await activePage.evaluate(() => window.__authentication2Test?.configure({ locale: 'de' }))
    expect(await activePage.getByRole('heading', { name: 'Willkommen zurück', exact: true }).count()).toBe(1)
    expect(await input.inputValue()).toBe('audit@example.invalid')
    await toggle.click()
    expect(await input.inputValue()).toBe('audit-team')
    await activePage.evaluate(() => window.__authentication2Test?.clearActions())
    await input.press('Enter')
    const actions = await activePage.evaluate(() => window.__authentication2Test?.actions() ?? [])
    expect(actions).toHaveLength(1)
    expect(actions[0]?.variantId).toBe('hbar-app-ui-authentication-2')
    expect(actions[0]?.actionId).toBe('request-authentication-continue')
    expect(JSON.parse(actions[0]?.value ?? '{}')).toEqual({
      kind: 'continue-request',
      mode: 'sso',
      providerId: 'sso',
      draft: 'audit-team',
      outcome: 'authentication-and-navigation-unverified',
    })
    expect(await input.inputValue()).toBe('audit-team')
    await activePage.evaluate(() => window.__authentication2Test?.configure({ locale: 'en' }))
    expect(await input.inputValue()).toBe('audit-team')
    await activePage.evaluate(() => window.__authentication2Test?.configure({ capacity: 'one' }))
    expect(await input.inputValue()).toBe('')
    expect(await input.getAttribute('data-auth2-draft')).toBe('email')
  }, 20_000)

  test('keeps scoped request-only actions, wrong-variant pass-through, and the legacy callback API', async () => {
    const activePage = requiredPage()
    await activePage.evaluate(() => {
      window.__authentication2Test?.configure({ capacity: 'source' })
      window.__authentication2Test?.clearActions()
    })
    await activePage.getByRole('button', { name: 'Continue with GitHub', exact: true }).click()
    await activePage.locator('[data-auth2-action="terms"]').click()
    const actions = await activePage.evaluate(() => window.__authentication2Test?.actions() ?? [])
    expect(actions).toHaveLength(2)
    expect(JSON.parse(actions[0]?.value ?? '{}')).toEqual({
      kind: 'provider-request',
      providerId: 'github',
      outcome: 'authentication-and-navigation-unverified',
    })
    expect(JSON.parse(actions[1]?.value ?? '{}')).toEqual({
      kind: 'navigation-request',
      action: 'terms',
      outcome: 'authentication-and-navigation-unverified',
    })
    expect(await activePage.locator('[data-auth2-draft]').inputValue()).toBe('')
    await activePage.evaluate(() => window.__authentication2Test?.configure({ bypass: true }))
    expect(await activePage.locator('[data-auth2-controlled]').getAttribute('data-auth2-controlled')).toBe('false')
    expect(await activePage.locator('[data-auth2-inherited-title]').getAttribute('data-auth2-inherited-title')).toBe(
      'Parent sign-in contract',
    )
    await activePage.evaluate(() => {
      window.__authentication2Test?.configure({ legacy: true, bypass: false })
      window.__authentication2Test?.clearActions()
    })
    const input = activePage.locator('[data-auth2-draft]')
    await input.fill('legacy@example.invalid')
    await input.press('Enter')
    const legacyActions = await activePage.evaluate(() => window.__authentication2Test?.actions() ?? [])
    expect(legacyActions).toEqual([{ variantId: 'hbar-app-ui-authentication-2', actionId: 'continue', value: 'email' }])
    expect(await input.inputValue()).toBe('legacy@example.invalid')
    expect(errors).toEqual([])
  }, 20_000)
})
