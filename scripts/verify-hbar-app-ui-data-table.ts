import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/data-table-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ variant: `hbar-app-ui-data-table-${variant}`, mode: 'isolated' })
  if (fixture) query.set('tableFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-data-table-${variant}"]`)
  await expect(root).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Table${variant} page overflow`,
  )
  checks.push(`Table${variant}${fixture ? ` ${fixture}` : ''}: renders with no page horizontal overflow`)
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
    const accounts = await open(page, 1)
    await expect(accounts.locator('tbody > tr')).toHaveCount(10)
    await accounts.getByRole('button', { name: 'Scale', exact: true }).click()
    await expect(accounts.locator('tbody > tr')).toHaveCount(3)
    await accounts.getByRole('button', { name: 'Sort by MRR', exact: true }).click()
    await expect(accounts.locator('tbody > tr').first()).toContainText('Kite Harbor Logistics')
    await accounts.locator('summary').click()
    await accounts.locator('.lumen-data-table-columns').getByLabel('Region', { exact: true }).uncheck()
    await expect(accounts.getByRole('columnheader', { name: 'Region', exact: true })).toHaveCount(0)
    checks.push('Table1: plan filtering, actual numeric sorting and independent column visibility')

    const payments = await open(page, 2)
    await expect(payments.getByText('2 selected', { exact: true })).toBeVisible()
    await expect(payments.getByText('$16,300', { exact: true })).toBeVisible()
    await payments.getByRole('button', { name: 'Clear selection', exact: true }).click()
    await payments.getByRole('checkbox', { name: 'Select Granite Switchgear Supply', exact: true }).check()
    await expect(payments.getByText('1 selected', { exact: true })).toBeVisible()
    await payments.getByRole('button', { name: 'Hold', exact: true }).click()
    await expect(page.locator('.lumen-data-table-preview-notice')).toBeVisible()
    await expect(
      payments.getByRole('checkbox', { name: 'Select Granite Switchgear Supply', exact: true }),
    ).toBeChecked()
    await payments.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(payments.getByText('11–20 of 28', { exact: true })).toBeVisible()
    checks.push('Table2: selection sum, request-only Hold preserves facts, page navigation changes range')

    const budget = await open(page, 3)
    await budget.getByRole('button', { name: 'Edit Hours for Warehouse cutover rehearsal', exact: true }).click()
    const hours = budget.getByRole('textbox', { name: 'Edit Hours for Warehouse cutover rehearsal', exact: true })
    await hours.fill('40')
    await hours.press('Enter')
    await expect(budget.locator('tbody > tr').first()).toContainText('$5,800')
    await expect(budget.getByText('$49,275', { exact: true })).toBeVisible()
    await expect(
      budget.getByRole('button', { name: 'Edit Hours for Executive weekly operating packet', exact: true }),
    ).toHaveCount(0)
    checks.push('Table3: numeric edit commits local values and both totals; locked cells stay read-only')
    await budget.getByText('$49,275', { exact: true }).scrollIntoViewIfNeeded()
    await expect(budget.getByText('$49,275', { exact: true })).toBeInViewport()
    await page.screenshot({ path: resolve(output, 'table-budget-desktop.png'), fullPage: true })

    const checksTable = await open(page, 4)
    await expect(checksTable.locator('.lumen-data-table-check-detail')).toHaveCount(1)
    await checksTable
      .getByRole('button', { name: 'Collapse Nightly claims ledger reconciliation', exact: true })
      .click()
    await expect(checksTable.locator('.lumen-data-table-check-detail')).toHaveCount(0)
    await checksTable.getByRole('textbox', { name: 'Search checks', exact: true }).fill('Freight invoice')
    await expect(checksTable.locator('tbody > tr')).toHaveCount(1)
    checks.push('Table4: expanded details collapse in place and search filters real checks')

    const dispatch = await open(page, 5)
    await expect(dispatch.locator('.lumen-data-table-group')).toHaveCount(3)
    await dispatch.getByRole('button', { name: 'Compact', exact: true }).click()
    await expect(dispatch.locator('.lumen-data-table-reference-scroll')).toHaveAttribute('data-density', 'compact')
    checks.push('Table5: ten orders in three windows; density changes spacing without changing records')

    const shipments = await open(page, 6)
    await expect(shipments.getByText('Crossline Freight', { exact: true })).toBeVisible()
    await shipments.getByRole('button', { name: /Meridian Lab Supply/ }).click()
    await expect(shipments.locator('.lumen-data-table-shipment-detail h3').first()).toHaveText('Meridian Lab Supply')
    await shipments.getByRole('textbox', { name: 'Search shipments', exact: true }).fill('Everbranch')
    await expect(shipments.locator('.lumen-data-table-shipment-list li')).toHaveCount(1)
    checks.push('Table6: shipment identity changes locally and query narrows host records')

    const sources = await open(page, 7)
    await expect(sources.locator('.lumen-data-table-reference-skeleton')).toHaveCount(11)
    await sources.getByRole('button', { name: 'Error', exact: true }).click()
    await expect(sources.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    await sources.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.locator('.lumen-data-table-preview-notice')).toBeVisible()
    checks.push('Table7: loading/error composition, retry only records request unless observed transition requires it')

    const capacity = await open(page, 8)
    await expect(capacity.locator('thead th')).toHaveCount(11)
    await capacity.getByRole('button', { name: 'Sort by Peak', exact: true }).click()
    await expect(capacity.locator('tbody tr').first()).toContainText('Phoenix Sortation')
    checks.push('Table8: eleven columns and real numeric peak sorting')

    await page.setViewportSize({ width: 360, height: 780 })
    const localized = await open(page, 1, 'localized')
    await expect(localized.locator('.lumen-data-table-account-cards')).toBeVisible()
    await expect(localized.locator('.lumen-data-table-reference-scroll')).not.toBeVisible()
    await page.screenshot({ path: resolve(output, 'table-accounts-localized-narrow.png'), fullPage: true })
    checks.push('Table1 narrow: semantic account cards and long German header, no wide-table page spill')
    const wide = await open(page, 8)
    assert(
      await wide.locator('.lumen-data-table-reference-scroll').evaluate((el) => el.scrollWidth > el.clientWidth),
      'Wide table must scroll within its own region',
    )
    checks.push('Table8 narrow: table horizontal scrolling belongs to the table region')
    await page.setViewportSize({ width: 1192, height: 760 })
    const stress = await open(page, 8, 'overflow')
    const pane = stress.locator('.lumen-data-table-reference-scroll')
    await expect(pane.locator('tbody tr')).toHaveCount(81)
    const last = pane.getByText('Distribution site 80', { exact: true })
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
    assert(await pane.evaluate((el) => el.scrollTop > 0), 'Stress rows do not scroll their own pane')
    await page.screenshot({ path: resolve(output, 'table-capacity-overflow.png'), fullPage: true })
    checks.push('Table8 overflow: 81st supplied site reachable inside table pane')
    assert(diagnostics.length === 0, `Browser diagnostics ${JSON.stringify(diagnostics)}`)
    const report = {
      coverage: 'core-flows-and-representative-layout',
      variants: 8,
      checks,
      diagnostics,
      limits: 'No exhaustive button/theme/viewport matrix; unobserved records/details are explicitly unavailable.',
    }
    await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await browser.close()
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
