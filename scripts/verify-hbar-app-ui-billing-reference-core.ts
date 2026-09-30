import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const output = 'artifacts/billing-reference-core-review'
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
  const parameters = new URLSearchParams({ variant: `hbar-app-ui-billing-${variant}`, mode: 'isolated' })
  if (localized) parameters.set('billingFixture', 'localized')
  return `${baseUrl}/?${parameters}`
}
async function checkNoPageOverflow() {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

try {
  await mkdir(output, { recursive: true })
  await page.clock.install()

  // Each independent composition mounts once; shared controls are exercised below, not per item/viewport.
  const sourceStructures = [
    { variant: 1, selector: '[data-hbar-app-ui-region="invoice-ledger"] tbody > tr', count: 8 },
    { variant: 2, selector: '.hbar-app-ui-billing-reference-plans-card', count: 3 },
    { variant: 3, selector: '[data-hbar-app-ui-region="invoice-composer"] [data-hbar-app-ui-field]', count: 10 },
    {
      variant: 4,
      selector: '[data-hbar-app-ui-region="recovery-subscriptions"] tr[data-hbar-app-ui-item-id]',
      count: 6,
    },
    { variant: 5, selector: 'input[type="radio"]', count: 4 },
    { variant: 6, selector: '.hbar-app-ui-billing-reference-payment-method-row', count: 3 },
    { variant: 7, selector: '[role="tab"]', count: 3 },
    { variant: 8, selector: '.lumen-billing-invoice-reference-table-scroll tbody > tr', count: 4 },
  ]
  for (const structure of sourceStructures) {
    await page.goto(url(structure.variant), { waitUntil: 'domcontentloaded' })
    await expect(page.locator(structure.selector)).toHaveCount(structure.count)
    await checkNoPageOverflow()
  }

  // One controlled search sample and one captured-save sample cover the reused mechanisms.
  await page.goto(url(1), { waitUntil: 'domcontentloaded' })
  await page.locator('[data-hbar-app-ui-field="invoice-search"]').fill('Lumendesk')
  await expect(page.locator('[data-hbar-app-ui-region="invoice-ledger"] tbody > tr')).toHaveCount(1)

  await page.goto(url(2), { waitUntil: 'domcontentloaded' })
  const active = page.getByRole('switch', { name: 'Starter: Active', exact: true })
  await active.uncheck()
  await expect(active).not.toBeChecked()
  const save = page.getByRole('button', { name: 'Save changes', exact: true })
  await save.click()
  await expect(save).toBeDisabled()
  await page.clock.runFor(600)
  await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Nothing was published')
  await page.screenshot({ path: `${output}/plans-desktop.png`, fullPage: true })

  await page.goto(url(3), { waitUntil: 'domcontentloaded' })
  await page.getByRole('textbox', { name: 'Customer', exact: true }).fill('A retained invoice draft')
  await page.getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(page.getByText('Step 1 of 4 · Customer', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Customer', exact: true })).toHaveValue('A retained invoice draft')

  // Expansion and selection change different structures; one record each is sufficient.
  await page.goto(url(4), { waitUntil: 'domcontentloaded' })
  const attempts = page.locator('[data-hbar-app-ui-region="retry-attempts"]')
  const expand = page.getByRole('button', { name: 'Retry attempts for Halcyon Pay', exact: true })
  await expect(attempts.locator('li')).toHaveCount(3)
  await expand.click()
  await expect(attempts).toHaveCount(0)
  await expand.click()
  await expect(attempts.locator('li')).toHaveCount(3)

  await page.goto(url(5), { waitUntil: 'domcontentloaded' })
  await page.getByRole('radio', { name: 'Starter', exact: true }).check()
  const summary = page.locator('.lumen-billing-change-summary')
  await expect(summary).toContainText('$0')
  await expect(summary).toContainText('$348')
  await expect(summary).toContainText('$580')
  await expect(summary).not.toContainText('$1,920')
  await page.screenshot({ path: `${output}/plan-change-desktop.png`, fullPage: true })

  await page.goto(url(6), { waitUntil: 'domcontentloaded' })
  const mastercard = page.locator('[data-hbar-app-ui-item-id="mastercard-8829"]')
  await mastercard.getByRole('button', { name: 'Make primary', exact: true }).click()
  await page.clock.runFor(600)
  await expect(mastercard.getByText('Primary', { exact: true })).toBeVisible()

  await page.goto(url(7), { waitUntil: 'domcontentloaded' })
  const currentPeriod = page.getByRole('tab', { name: 'This cycle', exact: true })
  await currentPeriod.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Last cycle', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('progressbar').first()).toHaveAttribute('aria-valuetext', '120%')

  // Two narrow samples cover the genuinely different mechanisms: stacked form and inner table scrolling.
  await page.setViewportSize({ width: 320, height: 520 })
  await page.goto(url(3, true), { waitUntil: 'domcontentloaded' })
  const next = page.getByRole('button', { name: 'Nächster Schritt', exact: true })
  await next.scrollIntoViewIfNeeded()
  await expect(next).toBeInViewport()
  await checkNoPageOverflow()
  await page.screenshot({ path: `${output}/invoice-form-localized-narrow.png`, fullPage: true })

  await page.goto(url(8), { waitUntil: 'domcontentloaded' })
  const table = page.locator('.lumen-billing-invoice-reference-table-scroll')
  expect(
    await table.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
      return element.scrollWidth > element.clientWidth && element.scrollLeft > 0
    }),
  ).toBe(true)
  const charge = page.getByRole('button', { name: 'Charge now', exact: true })
  await charge.scrollIntoViewIfNeeded()
  await expect(charge).toBeInViewport()
  await checkNoPageOverflow()
  await page.screenshot({ path: `${output}/invoice-detail-narrow.png`, fullPage: true })
  expect(errors).toEqual([])
  console.log(
    'Billing 1–8 practical core passed: source structures, controlled search/save/draft/expansion/selection/primary/tabs, stacked long-copy form and inner table scrolling. No exhaustive button/theme/viewport matrix, later-step source feedback or real payment is claimed.',
  )
} finally {
  await browser.close()
}
