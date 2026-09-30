import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const output = 'artifacts/chat-core-review'
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

function url(variant: number, outcome?: string, locale?: string): string {
  const params = new URLSearchParams({ variant: `hbar-app-ui-chat-${variant}`, mode: 'isolated' })
  if (outcome) params.set('chatOutcome', outcome)
  if (locale) params.set('chatFixture', locale)
  return `${baseUrl}/?${params}`
}

try {
  await mkdir(output, { recursive: true })
  await page.clock.install()
  // One shared composer mechanism; each remaining family gets only an initial mount, not repeated clicks.
  await page.goto(url(1), { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 2 })).toContainText('launch-room')
  await expect(page.locator('.lumen-chat-navigation')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pinned messages', exact: true })).toBeVisible()
  await page.getByRole('textbox').first().fill('A local channel preview message')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled()
  await page.clock.runFor(2000)
  await expect(page.getByText('A local channel preview message', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox').first()).toHaveValue('')
  await page.screenshot({ path: `${output}/team-confirmed.png`, fullPage: true })

  // Direct conversations exercise target capture: an acknowledgement never appears in the newly selected contact.
  await page.goto(url(2), { waitUntil: 'domcontentloaded' })
  await page.getByRole('textbox').first().fill('Only Sofia should receive this local preview')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.getByRole('button', { name: /Marcus Bell/ }).click()
  await page.clock.runFor(2000)
  await expect(page.getByText('Only Sofia should receive this local preview', { exact: true })).toHaveCount(0)
  await page.getByRole('textbox').first().fill('Marcus draft survives switching')
  await page.getByRole('button', { name: /Sofia Alvarez/ }).click()
  await expect(page.getByText('Only Sofia should receive this local preview', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Marcus Bell/ }).click()
  await expect(page.getByRole('textbox').first()).toHaveValue('Marcus draft survives switching')

  await page.goto(url(2, 'failed'), { waitUntil: 'domcontentloaded' })
  await page.getByRole('textbox').first().fill('A failed preview must keep this draft')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.clock.runFor(2000)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('textbox').first()).toHaveValue('A failed preview must keep this draft')

  for (const variant of [3, 4, 5, 6]) {
    await page.goto(url(variant), { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('textbox').first()).toBeVisible()
  }

  await page.setViewportSize({ width: 320, height: 520 })
  await page.goto(url(1, undefined, 'localized'), { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Nachricht senden', exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: 'Nachricht senden', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.screenshot({ path: `${output}/team-localized-narrow.png`, fullPage: true })
  expect(errors).toEqual([])
  console.log(
    'Chat practical core passed: reference Team structure, shared composer pending/confirmation/failure, captured Direct target and per-contact drafts, other family mounts and narrow long-copy reachability. Other-family reference fidelity and remote delivery are not claimed.',
  )
} finally {
  await browser.close()
}
