import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const output = 'artifacts/support-thread-core-review'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1086, height: 720 } })
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

function url(outcome?: string, locale?: string): string {
  const params = new URLSearchParams({ variant: 'hbar-app-ui-support-3', mode: 'isolated' })
  if (outcome) params.set('supportReplyOutcome', outcome)
  if (locale) params.set('supportFixture', locale)
  return `${baseUrl}/?${params}`
}

try {
  await mkdir(output, { recursive: true })
  await page.clock.install()
  await page.goto(url('failed'), { waitUntil: 'domcontentloaded' })
  const reply = page.getByRole('textbox').first()
  await expect(page.locator('.lumen-support-messages > li')).toHaveCount(6)
  await expect(page.getByRole('button', { name: 'Mark resolved', exact: true })).toHaveCount(0)
  await reply.fill('Keep my local reply after a failed acknowledgement')
  await page.getByRole('button', { name: 'Send reply', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Send reply', exact: true })).toBeDisabled()
  await page.clock.runFor(2000)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(reply).toHaveValue('Keep my local reply after a failed acknowledgement')
  await expect(page.locator('.lumen-support-messages > li')).toHaveCount(6)

  await page.goto(url(), { waitUntil: 'domcontentloaded' })
  for (const body of ['First local preview reply', 'Second local preview reply']) {
    await page.getByRole('textbox').first().fill(body)
    await page.getByRole('button', { name: 'Send reply', exact: true }).click()
    await page.clock.runFor(2000)
    await expect(page.locator('.lumen-support-messages').getByText(body, { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox').first()).toHaveValue('')
  }
  await expect(page.locator('.lumen-support-messages > li')).toHaveCount(8)
  await expect(page.getByRole('status')).toContainText(/preview/i)
  await page.screenshot({ path: `${output}/confirmed-desktop.png`, fullPage: true })

  await page.setViewportSize({ width: 320, height: 520 })
  await page.goto(url(undefined, 'localized'), { waitUntil: 'domcontentloaded' })
  // The old family stylesheet reordered the sidebar and could collapse the narrow transcript to zero.
  await expect(page.locator('.lumen-support-messages > li').first()).toBeVisible()
  expect(await page.locator('.lumen-support-messages').evaluate((element) => element.clientHeight)).toBeGreaterThan(0)
  const replyRect = await page.locator('.lumen-support-reply').boundingBox()
  const asideRect = await page.locator('.lumen-support-thread > aside').boundingBox()
  if (!replyRect || !asideRect) throw new Error('Missing reference reply/sidebar regions')
  expect(replyRect.y).toBeLessThan(asideRect.y)
  await page.getByRole('button', { name: 'Antwort senden', exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: 'Antwort senden', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Den weiterführenden Artikel öffnen', exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: 'Den weiterführenden Artikel öffnen', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.screenshot({ path: `${output}/localized-narrow.png`, fullPage: true })
  expect(errors).toEqual([])
  console.log(
    'Support Thread practical reference flow passed: six supplied messages, pending/failure-preserved draft, successive local-only confirmations, source action set and narrow long-copy reachability. No remote delivery or strict matrix claimed.',
  )
} finally {
  await browser.close()
}
