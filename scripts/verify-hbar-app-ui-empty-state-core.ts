import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const output = 'artifacts/empty-state-core-review'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1086, height: 760 } })
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

function url(variant: number, fixture?: string): string {
  const parameters = new URLSearchParams({ variant: `hbar-app-ui-empty-state-${variant}`, mode: 'isolated' })
  if (fixture) parameters.set('emptyStateFixture', fixture)
  return `${baseUrl}/?${parameters}`
}

try {
  await mkdir(output, { recursive: true })
  await page.clock.install()
  // Different structures get a default observation; no theme/viewport Cartesian product.
  for (const variant of [1, 2, 3, 4, 5]) {
    await page.goto(url(variant), { waitUntil: 'domcontentloaded' })
    const surface = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-empty-state-${variant}"]`).first()
    await expect(surface.getByRole('heading', { level: 2 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.screenshot({ path: `${output}/default-${variant}.png`, fullPage: true })
  }

  // Search/filter/suggestion projection is one shared state mechanism.
  await page.goto(url(2), { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Remove Owner filter', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove Owner filter', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await expect(page.getByRole('button', { name: /Remove .* filter/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'quarterly revenue 46', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Search reports' })).toHaveValue('quarterly revenue')

  // Retry is an unverified request, not a fabricated successful workspace load.
  await page.goto(url(4), { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('button', { name: /Trying|Retrying/ })).toBeDisabled()
  await page.clock.runFor(2500)
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled()
  await expect(page.getByRole('alert')).toBeVisible()

  // Native selection forwards metadata and produces local selection feedback, not an upload result.
  await page.goto(url(5), { waitUntil: 'domcontentloaded' })
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'preview.pdf', mimeType: 'application/pdf', buffer: Buffer.from('preview file') })
  await expect(page.getByRole('status')).toContainText(/selected|preview/i)

  // One narrow long-copy sample and one over-bound content-grown sample are sufficient for shared flow.
  await page.setViewportSize({ width: 320, height: 480 })
  for (const [variant, fixture] of [
    [2, 'long'],
    [1, 'overflow'],
  ] as const) {
    await page.goto(url(variant, fixture), { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { level: 2 }).waitFor()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.getByRole('button').last().scrollIntoViewIfNeeded()
    await expect(page.getByRole('button').last()).toBeInViewport()
    await page.screenshot({ path: `${output}/${fixture}-${variant}-narrow.png`, fullPage: true })
  }
  expect(errors).toEqual([])
  console.log(
    'Empty State 1-5 practical flows passed: distinct default structures, filters/query, cancellable retry, local file selection and shared narrow/content-grown layouts. No strict pixel matrix or remote-service claims.',
  )
} finally {
  await browser.close()
}
