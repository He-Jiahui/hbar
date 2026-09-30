import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { basename, resolve } from 'node:path'
import { chromium, expect as browserExpect, type Browser, type Page } from '@playwright/test'
import type { Authentication4BrowserHarness } from './fixtures/authentication4-host-browser'

declare global {
  interface Window {
    __authentication4Test?: Authentication4BrowserHarness | undefined
  }
}

let server: ReturnType<typeof Bun.serve> | undefined
let browser: Browser | undefined
let page: Page | undefined
const errors: string[] = []

function requiredPage(): Page {
  if (!page) throw new Error('Authentication 4 host browser did not start')
  return page
}

beforeAll(async () => {
  const build = await Bun.build({
    entrypoints: [resolve(import.meta.dir, 'fixtures/authentication4-host-browser.tsx')],
    target: 'browser',
    format: 'esm',
  })
  if (!build.success) throw new Error(build.logs.map((log) => log.message).join('\n'))
  const assets = new Map(build.outputs.map((output) => [basename(output.path), output]))
  const entry = [...assets.keys()].find((name) => name.endsWith('.js'))
  if (!entry) throw new Error('Authentication 4 fixture emitted no JavaScript')
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
      const type = pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : asset.type
      return new Response(asset, { headers: { 'content-type': type } })
    },
  })
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  })
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.clock.install({ time: new Date('2026-09-30T00:00:00.000Z') })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`)
  })
  await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__authentication4Test !== undefined)
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

describe('Authentication 4 public host integration', () => {
  test('keeps native form submission with Host validation, deduplicates pending work, and cancels sign-in through Back', async () => {
    const active = requiredPage()
    const primary = active.locator('[data-auth4-owner="primary"]')
    const secondary = active.locator('[data-auth4-owner="secondary"]')
    const phase = primary.locator('[data-auth4-phase]')
    const email = primary.getByRole('textbox', { name: 'Work email', exact: true })
    expect(await primary.locator('[data-auth4-probe]').getAttribute('data-auth4-inherited-title')).toBe(
      'Inherited sign-in contract',
    )
    expect(await phase.getAttribute('data-auth4-phase')).toBe('email')
    await email.fill('invalid')
    await email.press('Enter')
    await browserExpect(primary.getByRole('alert')).toHaveText('Enter a valid email address.')
    expect(await email.getAttribute('aria-invalid')).toBe('true')
    expect(await active.evaluate(() => window.__authentication4Test?.actions() ?? [])).toHaveLength(0)

    await email.fill('audit@example.invalid')
    await browserExpect(primary.getByRole('alert')).toHaveCount(0)
    expect(await email.getAttribute('aria-invalid')).toBe('false')
    await email.press('Enter')
    await browserExpect(primary.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled()
    await active.evaluate(() => window.__authentication4Test?.repeatContinue())
    expect(await active.evaluate(() => window.__authentication4Test?.actions() ?? [])).toHaveLength(1)
    expect(await phase.getAttribute('data-auth4-phase')).toBe('email-pending')
    await active.clock.fastForward(1_050)
    await browserExpect(phase).toHaveAttribute('data-auth4-phase', 'password')
    const password = primary.getByRole('textbox', { name: 'Password', exact: true })
    await browserExpect(password).toBeFocused()
    expect(await primary.getByText('audit@example.invalid', { exact: true }).count()).toBe(1)
    expect(await secondary.getByRole('textbox', { name: 'Password', exact: true }).inputValue()).toBe('')
    expect(await password.getAttribute('autocomplete')).toBe('current-password')
    await password.fill('NeverLogThis-4!')
    await password.press('Enter')
    await browserExpect(phase).toHaveAttribute('data-auth4-phase', 'sign-in-pending')
    const records = await active.evaluate(() => window.__authentication4Test?.actions() ?? [])
    expect(records).toHaveLength(2)
    expect(records[1]?.event.actionId).toBe('request-authentication-sign-in')
    const request: unknown = JSON.parse(records[1]?.event.value ?? '{}')
    expect(request).toMatchObject({
      email: 'audit@example.invalid',
      outcome: 'authentication-and-navigation-unverified',
    })
    expect(JSON.stringify(records)).not.toContain('NeverLogThis-4!')
    await primary.getByRole('button', { name: 'Back', exact: true }).click()
    await active.clock.fastForward(2_000)
    await browserExpect(phase).toHaveAttribute('data-auth4-phase', 'email')
    expect(await email.inputValue()).toBe('audit@example.invalid')
  }, 20_000)

  test('retains independent drafts and reveal state across copy changes and uses the latest callback', async () => {
    const active = requiredPage()
    await active.evaluate(() => window.__authentication4Test?.configure({ locale: 'en', scenario: 'password' }))
    const primary = active.locator('[data-auth4-owner="primary"]')
    const secondary = active.locator('[data-auth4-owner="secondary"]')
    const password = primary.getByRole('textbox', { name: 'Password', exact: true })
    await password.fill('CopyStableSecret-4!')
    await primary.getByRole('button', { name: 'Show password', exact: true }).click()
    await secondary.getByRole('textbox', { name: 'Password', exact: true }).fill('OtherOwnerSecret-4!')
    await active.evaluate(() => window.__authentication4Test?.configure({ locale: 'de', callbackTag: 'updated' }))
    const translated = primary.getByRole('textbox', { name: 'Passwort', exact: true })
    await browserExpect(primary.getByRole('button', { name: 'Passwort verbergen', exact: true })).toHaveCount(1)
    expect(await translated.inputValue()).toBe('CopyStableSecret-4!')
    expect(await translated.getAttribute('type')).toBe('text')
    expect(await secondary.getByRole('textbox', { name: 'Passwort', exact: true }).inputValue()).toBe(
      'OtherOwnerSecret-4!',
    )
    expect(await secondary.getByRole('textbox', { name: 'Passwort', exact: true }).getAttribute('type')).toBe(
      'password',
    )
    await active.evaluate(() => window.__authentication4Test?.clearActions())
    await translated.press('Enter')
    const records = await active.evaluate(() => window.__authentication4Test?.actions() ?? [])
    expect(records).toHaveLength(1)
    expect(records[0]?.owner).toBe('primary')
    expect(records[0]?.callbackTag).toBe('updated')
    expect(JSON.stringify(records)).not.toContain('CopyStableSecret-4!')
    expect(JSON.stringify(records)).not.toContain('OtherOwnerSecret-4!')
  }, 20_000)

  test('retires old callbacks and timers when the scenario owner changes, and passes through other variants', async () => {
    const active = requiredPage()
    await active.evaluate(() => window.__authentication4Test?.configure({ locale: 'en', scenario: 'source' }))
    const primary = active.locator('[data-auth4-owner="primary"]')
    await primary.getByRole('textbox', { name: 'Work email', exact: true }).press('Enter')
    await browserExpect(primary.locator('[data-auth4-phase]')).toHaveAttribute('data-auth4-phase', 'email-pending')
    await active.evaluate(() => window.__authentication4Test?.capturePrimaryFlow())
    await active.evaluate(() => window.__authentication4Test?.configure({ initialEmail: 'fresh@example.invalid' }))
    await browserExpect(primary.getByRole('textbox', { name: 'Work email', exact: true })).toHaveValue(
      'fresh@example.invalid',
    )
    await active.evaluate(() => window.__authentication4Test?.clearActions())
    await active.evaluate(() => window.__authentication4Test?.invokeCapturedFlow())
    await active.clock.fastForward(2_000)
    expect(await active.evaluate(() => window.__authentication4Test?.actions() ?? [])).toHaveLength(0)
    expect(await primary.getByRole('textbox', { name: 'Work email', exact: true }).inputValue()).toBe(
      'fresh@example.invalid',
    )
    expect(await primary.locator('[data-auth4-phase]').getAttribute('data-auth4-phase')).toBe('email')
    await active.evaluate(() => window.__authentication4Test?.configure({ wrongVariant: true }))
    await browserExpect(primary.locator('[data-auth4-probe]')).toHaveAttribute('data-auth4-controlled', 'false')
    expect(await active.locator('[data-hbar-app-ui-auth4-controlled]').count()).toBe(0)
    expect(errors).toEqual([])
  }, 20_000)
})
