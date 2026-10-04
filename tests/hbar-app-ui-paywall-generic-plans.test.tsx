import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { basename, resolve } from 'node:path'
import { chromium, type Browser, type Page } from '@playwright/test'
import type { PaywallPlansBrowserHarness } from './fixtures/paywall-generic-plans-browser'

declare global {
  interface Window {
    __paywallPlansTest?: PaywallPlansBrowserHarness | undefined
  }
}

interface ServedAsset {
  readonly body: Blob
  readonly contentType: string
}

let server: ReturnType<typeof Bun.serve> | undefined
let browser: Browser | undefined
let page: Page | undefined
let pageErrors: string[] = []

function requiredPage() {
  if (!page) throw new Error('Paywall generic-plans test browser did not start')
  return page
}

async function planPrices(activePage: Page) {
  return (await activePage.locator('.hbar-app-ui-paywall-plan-price strong').allTextContents()).map((price) =>
    price.trim(),
  )
}

beforeAll(async () => {
  const build = await Bun.build({
    entrypoints: [resolve(import.meta.dir, 'fixtures/paywall-generic-plans-browser.tsx')],
    target: 'browser',
    format: 'esm',
    splitting: false,
  })
  if (!build.success) {
    throw new Error(build.logs.map((log) => log.message).join('\n') || 'Browser fixture build failed')
  }

  const assets = new Map<string, ServedAsset>()
  for (const output of build.outputs) {
    const fileName = basename(output.path)
    const contentType = output.path.endsWith('.js')
      ? 'text/javascript; charset=utf-8'
      : output.path.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : output.path.endsWith('.svg')
          ? 'image/svg+xml'
          : 'application/octet-stream'
    assets.set(fileName, { body: output, contentType })
  }

  const entryName = [...assets.keys()].find((fileName) => fileName.endsWith('.js'))
  if (!entryName) throw new Error('Browser fixture did not emit a JavaScript entrypoint')
  const styles = [...assets.keys()].filter((fileName) => fileName.endsWith('.css'))
  const styleLinks = styles
    .map((fileName) => `<link rel="stylesheet" href="/assets/${encodeURIComponent(fileName)}">`)
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">${styleLinks}</head><body><div id="root"></div><script type="module" src="/assets/${encodeURIComponent(entryName)}"></script></body></html>`

  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/') return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      if (url.pathname.startsWith('/assets/')) {
        const name = decodeURIComponent(url.pathname.slice('/assets/'.length))
        const asset = assets.get(name)
        if (asset) return new Response(asset.body, { headers: { 'content-type': asset.contentType } })
      }
      return new Response('Not found', { status: 404 })
    },
  })

  const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  browser = await chromium.launch({ headless: true, executablePath })
  page = await browser.newPage({ viewport: { width: 1000, height: 760 } })
  pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) pageErrors.push(`HTTP ${response.status()} ${response.url()}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })
  await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Choose a plan to continue', exact: true }).waitFor()
  await page.waitForFunction(() => window.__paywallPlansTest !== undefined)
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

describe('generic Paywall plans period ownership', () => {
  test('updates visible prices, resets only when initialPeriod changes, and keeps stable plan actions', async () => {
    const activePage = requiredPage()
    const periodButtons = activePage.locator('.hbar-app-ui-paywall-period button')
    expect(await periodButtons.count()).toBe(2)
    expect(await activePage.getByRole('button', { name: 'Yearly', exact: true }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(await planPrices(activePage)).toEqual(['$0', '$19', '$54'])

    await activePage.getByRole('button', { name: 'Monthly', exact: true }).click()
    expect(await activePage.getByRole('button', { name: 'Monthly', exact: true }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(await planPrices(activePage)).toEqual(['$0', '$24', '$54'])

    await activePage.evaluate(() => window.__paywallPlansTest?.replaceContent({ locale: 'de' }))
    expect(await activePage.getByRole('heading', { name: 'Wähle einen Plan', exact: true }).count()).toBe(1)
    expect(await activePage.getByRole('button', { name: 'Monatlich', exact: true }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(await planPrices(activePage)).toEqual(['$0', '$24', '$54'])

    await activePage.getByRole('button', { name: 'Jährlich', exact: true }).click()
    expect(await activePage.getByRole('button', { name: 'Jährlich', exact: true }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(await planPrices(activePage)).toEqual(['$0', '$19', '$54'])

    await activePage.evaluate(() => window.__paywallPlansTest?.replaceContent({ initialPeriod: 'monthly' }))
    const resetAtCommit = await activePage.evaluate(() => window.__paywallPlansTest?.snapshot() ?? null)
    expect(resetAtCommit).toEqual({ initialPeriod: 'monthly', selectedPeriodLabel: 'Monatlich' })
    expect(await activePage.getByRole('button', { name: 'Monatlich', exact: true }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(await planPrices(activePage)).toEqual(['$0', '$24', '$54'])

    await activePage.getByRole('button', { name: 'Jährlich', exact: true }).click()
    await activePage.evaluate(() =>
      window.__paywallPlansTest?.replaceContent({
        description: 'Inhalte aktualisiert, derselbe Ausgangszeitraum bleibt erhalten.',
      }),
    )
    const sameInitialPeriodCommit = await activePage.evaluate(() => window.__paywallPlansTest?.snapshot() ?? null)
    expect(sameInitialPeriodCommit).toEqual({
      initialPeriod: 'monthly',
      selectedPeriodLabel: 'Jährlich',
    })
    expect(
      await activePage
        .getByText('Inhalte aktualisiert, derselbe Ausgangszeitraum bleibt erhalten.', { exact: true })
        .count(),
    ).toBe(1)
    expect(await planPrices(activePage)).toEqual(['$0', '$19', '$54'])

    const currentPlanAction = activePage.locator('.hbar-app-ui-paywall-plan').nth(0).getByRole('button')
    const chooseProAction = activePage
      .locator('.hbar-app-ui-paywall-plan')
      .nth(1)
      .getByRole('button', { name: 'Wählen Pro', exact: true })
    expect(await currentPlanAction.isDisabled()).toBe(true)
    expect(await chooseProAction.isEnabled()).toBe(true)
    await chooseProAction.click()
    expect(await activePage.evaluate(() => window.__paywallPlansTest?.lastAction() ?? null)).toEqual({
      actionId: 'choose',
      value: 'pro',
    })
    expect(pageErrors).toEqual([])
  }, 20_000)
})
