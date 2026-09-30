import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const output = 'artifacts/support-reference-core-review'
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

function url(variant: number, localized = false): string {
  const params = new URLSearchParams({ variant: `hbar-app-ui-support-${variant}`, mode: 'isolated' })
  if (localized) params.set('supportFixture', 'localized')
  return `${baseUrl}/?${params}`
}

async function checkNoHorizontalOverflow() {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

try {
  await mkdir(output, { recursive: true })
  await page.clock.install()

  // One query sample exercises the shared controlled search mechanism, not every topic/article action.
  await page.goto(url(1), { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'How can we help?', exact: true })).toBeVisible()
  await expect(page.locator('[data-hbar-app-ui-action="support-help:open-topic"]')).toHaveCount(4)
  await expect(page.locator('[data-hbar-app-ui-action="support-help:open-article"]')).toHaveCount(4)
  await checkNoHorizontalOverflow()
  await page.screenshot({ path: `${output}/help-desktop.png`, fullPage: true })
  await page.getByRole('searchbox').fill('SAML')
  await expect(page.locator('[data-hbar-app-ui-action="support-help:open-topic"]')).toHaveCount(0)
  await expect(page.locator('[data-hbar-app-ui-action="support-help:open-article"]')).toHaveCount(1)

  // The new request filters are pressed buttons, and opening a creation flow does not invent a ticket.
  await page.goto(url(5), { waitUntil: 'domcontentloaded' })
  const rows = page.locator('[data-hbar-app-ui-action="open-request"]')
  await expect(rows).toHaveCount(6)
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByText('3 open · 1 waiting on your reply', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New request', exact: true }).click()
  await expect(rows).toHaveCount(6)
  await expect(page.getByText('3 open · 1 waiting on your reply', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(rows).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('searchbox').fill('4192')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Waiting on you')
  await checkNoHorizontalOverflow()
  await page.screenshot({ path: `${output}/requests-filtered-desktop.png`, fullPage: true })

  // Only widget-specific cancellation is new: the underlying failure/acknowledgement model is already shared.
  await page.goto(url(4), { waitUntil: 'domcontentloaded' })
  const composer = page.getByRole('textbox', { name: 'Message', exact: true })
  const transcript = page.locator('.lumen-support-assistant-reference-messages')
  await expect(transcript.locator('article')).toHaveCount(3)
  await expect(composer).toHaveJSProperty('tagName', 'TEXTAREA')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await composer.fill('Keep this assistant draft after closing')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(composer).toBeDisabled()
  await page.getByRole('button', { name: 'Close chat', exact: true }).click()
  await page.clock.runFor(2000)
  await page.getByRole('button', { name: 'Open support assistant', exact: true }).click()
  await expect(composer).toHaveValue('Keep this assistant draft after closing')
  await expect(transcript.locator('article')).toHaveCount(3)
  await expect(transcript.getByText('Keep this assistant draft after closing', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.clock.runFor(2000)
  await expect(composer).toHaveValue('')
  await expect(transcript.getByText('Keep this assistant draft after closing', { exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'No message was delivered' })).toContainText(
    'No message was delivered and no AI answer was requested',
  )
  await checkNoHorizontalOverflow()
  await page.screenshot({ path: `${output}/assistant-confirmed-desktop.png`, fullPage: true })

  // A single narrow long-copy surface exercises the new column-to-stacked-row layout.
  await page.setViewportSize({ width: 320, height: 520 })
  await page.goto(url(5, true), { waitUntil: 'domcontentloaded' })
  await expect(rows).toHaveCount(6)
  await rows.last().scrollIntoViewIfNeeded()
  await expect(rows.last()).toBeInViewport()
  await checkNoHorizontalOverflow()
  await page.screenshot({ path: `${output}/requests-localized-narrow.png`, fullPage: true })
  expect(errors).toEqual([])
  console.log(
    'Support 1/4/5 practical core passed: supplied native structures, search, open/waiting filters, request-only creation, assistant close/cancel/draft recovery and local-only acknowledgement, plus one narrow long-copy row sample. No exhaustive button/viewport matrix or remote result is claimed.',
  )
} finally {
  await browser.close()
}
