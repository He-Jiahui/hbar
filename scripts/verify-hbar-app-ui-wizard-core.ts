import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/wizard-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ mode: 'isolated', variant: `hbar-app-ui-wizard-${variant}`, theme: 'light' })
  if (fixture) query.set('wizardFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-wizard-${variant}"]`)
  await expect(root.getByRole('heading').first()).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Wizard${variant}: page overflow`,
  )
  return root
}

async function main() {
  assert((await fetch(baseUrl)).ok, 'Existing production preview unavailable; no automatic server start')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 760 } })
  page.on('pageerror', (error) => diagnostics.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(message.text())
  })
  try {
    const information = await open(page, 1)
    await information.getByRole('textbox', { name: 'Company', exact: true }).fill('Core workflow company')
    await information.getByRole('combobox', { name: 'Role', exact: true }).selectOption('Finance')
    await information.getByRole('button', { name: 'Next step', exact: true }).click()
    await expect(information.locator('.hbar-app-ui-wizard-information-step-number.is-complete')).toHaveCount(1)
    await expect(information.getByRole('textbox', { name: 'Company', exact: true })).toHaveValue(
      'Core workflow company',
    )
    await expect(information.getByRole('combobox', { name: 'Role', exact: true })).toHaveValue('Finance')
    await expect(information.getByRole('heading', { name: 'Your information', exact: true })).toBeVisible()
    checks.push('Information: edits and native choice survive captured progress-rail navigation')

    const invoice = await open(page, 2)
    await invoice.getByRole('textbox', { name: 'Customer', exact: true }).fill('Core customer')
    await invoice.getByRole('combobox', { name: 'Currency', exact: true }).selectOption('EUR')
    await expect(invoice.getByRole('textbox', { name: 'Customer', exact: true })).toHaveValue('Core customer')
    await expect(invoice.getByRole('combobox', { name: 'Currency', exact: true })).toHaveValue('EUR')
    await expect(invoice.locator('.hbar-app-ui-wizard-invoice-card-header')).toContainText('USD')
    await expect(invoice.getByRole('button', { name: 'Next step', exact: true })).toBeVisible()
    checks.push('Invoice: grouped fields editable, passive badge retained, pane-owned footer reachable')

    const upgrade = await open(page, 3)
    await upgrade.getByRole('radio', { name: /^Team / }).click()
    await expect(upgrade.getByRole('radio', { name: /^Team / })).toHaveAttribute('aria-checked', 'true')
    await upgrade.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(upgrade.locator('.hbar-app-ui-wizard-upgrade-step-number.is-complete')).toHaveCount(1)
    await expect(upgrade.getByText('$31,235', { exact: true })).toBeVisible()
    await expect(upgrade.getByRole('radiogroup', { name: 'Plan', exact: true })).toBeVisible()
    await page.screenshot({ path: resolve(output, 'wizard-upgrade-desktop.png'), fullPage: true })
    checks.push('Upgrade: plan choice and rail update without invented price recomputation or later page')

    const environment = await open(page, 4)
    const postgres = environment.getByRole('checkbox', { name: /^Managed Postgres/ })
    await postgres.focus()
    await page.keyboard.press('Space')
    await expect(postgres).toHaveAttribute('aria-checked', 'false')
    await expect(environment.getByText('2 of 8 selected', { exact: true })).toBeVisible()
    await expect(environment.getByText('Adds about 12s to each deploy', { exact: true })).toBeVisible()
    checks.push('Environment: keyboard toggle updates selection count and derived deploy estimate')

    const review = await open(page, 5)
    const send = review.getByRole('button', { name: 'Schedule send', exact: true })
    await expect(send).toBeDisabled()
    await review.getByRole('checkbox').click()
    await expect(send).toBeEnabled()
    await review.getByRole('checkbox').click()
    await expect(send).toBeDisabled()
    checks.push('Review: confirmation gates send; no delivery or completion claim')

    const migration = await open(page, 6)
    const progress = migration.getByRole('progressbar', { name: 'Migration progress', exact: true })
    await expect(progress).toHaveAttribute('aria-valuenow', '64')
    await expect(progress).toHaveAttribute('aria-valuenow', '66', { timeout: 5000 })
    checks.push('Migration: active owner advances captured bounded progress, without completing tasks')

    const shipping = await open(page, 7)
    await shipping.getByRole('radio', { name: 'Domestic only', exact: true }).click()
    await shipping.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(shipping.getByRole('heading', { name: 'How do parcels leave your site?', exact: true })).toBeVisible()
    await expect(shipping.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled()
    await shipping.getByRole('radio', { name: 'Courier pickup', exact: true }).click()
    await expect(shipping.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled()
    await shipping.getByRole('button', { name: 'Previous question', exact: true }).click()
    await expect(shipping.getByRole('radio', { name: 'Domestic only', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await page.screenshot({ path: resolve(output, 'wizard-shipping-desktop.png'), fullPage: true })
    checks.push('Shipping: per-question gating, next/previous navigation and retained answers')

    await page.setViewportSize({ width: 356, height: 720 })
    const localized = await open(page, 4, 'localized')
    await expect(localized.getByRole('heading', { name: '新环境', exact: true })).toBeVisible()
    await expect(localized.getByRole('button', { name: '设置限制', exact: true })).toBeVisible()
    await expect(localized.getByRole('checkbox').first()).toBeVisible()
    await expect(localized.getByRole('checkbox').last()).toBeVisible()
    await page.screenshot({ path: resolve(output, 'wizard-environment-narrow.png'), fullPage: true })
    checks.push('Representative narrow localized service cards: natural wrapping and reachable outside footer')

    const overflowing = await open(page, 2, 'overflow')
    const scroller = overflowing.locator('.hbar-app-ui-wizard-invoice-scroll')
    assert(
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return element.scrollTop > 0
      }),
      'Overflowing invoice cannot scroll to final field',
    )
    await expect(overflowing.getByRole('textbox', { name: 'Additional billing term 40', exact: true })).toBeVisible()
    await expect(overflowing.getByRole('button', { name: 'Next step', exact: true })).toBeVisible()
    await page.screenshot({ path: resolve(output, 'wizard-invoice-overflow.png'), fullPage: true })
    checks.push('Representative overflowing narrow invoice: final field reachable and footer stays visible')

    assert(diagnostics.length === 0, `Browser diagnostics: ${diagnostics.join('; ')}`)
    await writeFile(
      resolve(output, 'report.json'),
      JSON.stringify({ checks, diagnostics, exhaustiveMatrix: false }, null, 2),
    )
    console.log(JSON.stringify({ checks: checks.length, diagnostics: diagnostics.length, output }))
  } finally {
    await browser.close()
  }
}
await main()
