import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/dashboard-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ variant: `hbar-app-ui-dashboard-${variant}`, mode: 'isolated' })
  if (fixture) query.set('dashboardFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-dashboard-${variant}"]`)
  await expect(root).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Dashboard${variant} page overflow`,
  )
  checks.push(`Dashboard${variant}${fixture ? ` ${fixture}` : ''}: structure renders without page horizontal overflow`)
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
    const revenue = await open(page, 1)
    await expect(revenue.getByText('$2.59M', { exact: true })).toBeVisible()
    await expect(revenue.getByRole('combobox', { name: 'Date range' })).toHaveValue('6m')
    checks.push('Dashboard1: actual four revenue metrics and six-month chart')
    const signups = await open(page, 2)
    await signups.getByRole('tab', { name: '7 days', exact: true }).click()
    await expect(signups.getByRole('status').first()).toContainText('does not include data')
    await signups.getByRole('tab', { name: '30 days', exact: true }).click()
    await expect(signups.locator('tbody>tr')).toHaveCount(5)
    checks.push('Dashboard2: date selection and honest unknown-range recovery')
    const web = await open(page, 3)
    await web.getByRole('button', { name: 'Sessions, last 14 days options', exact: true }).click()
    await expect(web.getByRole('menuitem', { name: 'Refresh data', exact: true })).toBeVisible()
    await web.getByRole('menuitem', { name: 'Refresh data', exact: true }).click()
    await expect(web.getByText('Updated just now', { exact: true })).toBeVisible()
    checks.push('Dashboard3: source-shaped widget options and local refresh timestamp')
    const status = await open(page, 4)
    await status.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(status.getByText('Updated just now', { exact: true })).toBeVisible()
    await expect(status.locator('tbody>tr')).toHaveCount(9)
    checks.push('Dashboard4: refresh feedback preserves real service facts and seven incidents')
    const usage = await open(page, 5)
    await usage.getByRole('button', { name: 'Upgrade plan', exact: true }).click()
    await expect(page.locator('.lumen-dashboard-preview-notice')).toContainText('upgrade')
    await expect(usage.getByText('$99 / month · renews Mar 31', { exact: true })).toBeVisible()
    checks.push('Dashboard5: upgrade intent leaves plan and quota values unchanged')
    const channels = await open(page, 6)
    await channels.getByRole('switch', { name: 'Compare to previous' }).click()
    await expect(channels.getByRole('switch', { name: 'Compare to previous' })).toHaveAttribute('aria-checked', 'false')
    await expect(channels.getByText('+7.4%', { exact: true })).toHaveCount(0)
    checks.push('Dashboard6: compare state hides only period changes across sixteen real channels')
    const recurring = await open(page, 7)
    await recurring.getByRole('tab', { name: 'Loading', exact: true }).click()
    await expect(recurring.getByRole('status', { name: 'Loading revenue' })).toBeVisible()
    await recurring.getByRole('tab', { name: 'Empty', exact: true }).click()
    await expect(recurring.getByRole('heading', { name: 'No revenue data yet' })).toBeVisible()
    await recurring.getByRole('tab', { name: 'Ready', exact: true }).click()
    await expect(recurring.getByText('$148.2K', { exact: true })).toBeVisible()
    checks.push('Dashboard7: ready/loading/empty/recovery are actual content states')
    const modules = await open(page, 8)
    await modules.getByRole('textbox', { name: 'Search modules', exact: true }).fill('audit sample')
    await expect(modules.getByRole('heading', { name: 'No modules match “audit sample”' })).toBeVisible()
    await modules.getByRole('button', { name: 'Clear search', exact: true }).click()
    await expect(modules.locator('tbody>tr')).toHaveCount(12)
    await modules.getByRole('button', { name: 'Sort by progress', exact: true }).click()
    await expect(modules.locator('tbody>tr').first()).toContainText('Docs Portal')
    await modules.getByRole('button', { name: 'Ascending', exact: true }).click()
    await expect(modules.locator('tbody>tr').first()).toContainText('API Console')
    await modules.getByRole('button', { name: 'More actions for Access Matrix', exact: true }).click()
    await expect(modules.getByRole('menuitem', { name: 'Rename module', exact: true })).toBeVisible()
    await modules.getByRole('menuitem', { name: 'Rename module', exact: true }).press('Escape')
    await expect(modules.getByRole('menu')).toHaveCount(0)
    checks.push('Dashboard8: query recovery, real numeric sorting and bound module menu')
    const board = await open(page, 9)
    await board.getByRole('button', { name: 'Previous week', exact: true }).click()
    await expect(board.getByText('234h 30m logged · 77% client billable', { exact: true })).toBeVisible()
    await expect(board.getByRole('columnheader', { name: 'Mon, Mar 9', exact: true })).toBeVisible()
    await expect(board.getByRole('button', { name: 'Previous week', exact: true })).toBeDisabled()
    checks.push('Dashboard9: actual captured previous-week hours, types, totals and safe week bound')
    const explorer = await open(page, 10)
    await explorer.getByRole('tab', { name: /^Avg\. duration/ }).click()
    await expect(explorer.getByRole('status').first()).toContainText('does not include data')
    await explorer.getByRole('button', { name: 'Connect', exact: true }).first().click()
    await expect(page.locator('.lumen-dashboard-preview-notice')).toContainText('workflow')
    await expect(explorer.getByText('3 of 5 connected', { exact: true })).toBeVisible()
    checks.push('Dashboard10: selected measure changes, integration intent does not fake connection')
    const coverage = await open(page, 11)
    await coverage.getByRole('button', { name: 'Review', exact: true }).click()
    await expect(coverage.getByText('Cutoff 2:00 PM · 0 of 7 cleared', { exact: true })).toBeVisible()
    checks.push('Dashboard11: queue intent targets swap without pretending it is cleared')
    const payout = await open(page, 12)
    await payout.getByRole('button', { name: 'Split', exact: true }).click()
    await expect(payout.getByText('$505,870', { exact: true })).toBeVisible()
    await expect(payout.locator('tbody>tr')).toHaveCount(11)
    checks.push('Dashboard12: split is request-only; exact balances, eleven moves and four lanes remain')
    await page.screenshot({ path: resolve(output, 'dashboard-payout-desktop.png'), fullPage: true })
    const goals = await open(page, 13)
    await goals.getByRole('button', { name: 'Earn the second seat', exact: false }).click()
    await expect(goals.getByRole('button', { name: 'Earn the second seat', exact: false })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(goals.getByText('Reach first saved project in under 6 minutes', { exact: true })).toHaveCount(0)
    checks.push('Dashboard13: objective selection removes stale first-objective detail')
    const service = await open(page, 14)
    await service.getByRole('textbox', { name: 'Filter services', exact: true }).fill('ledger')
    await expect(service.locator('.lumen-dashboard-reference-service-list>button')).toHaveCount(1)
    await service.getByRole('button', { name: 'Logs', exact: true }).click()
    await expect(page.locator('.lumen-dashboard-preview-notice')).toContainText('ledger')
    await expect(service.getByText('402ms', { exact: true })).toBeVisible()
    checks.push('Dashboard14: filtered master-detail and exact Logs target preserve degraded service facts')
    await page.setViewportSize({ width: 390, height: 844 })
    const narrow = await open(page, 8, 'localized')
    await expect(narrow.getByRole('heading', { name: /langfristigen/ })).toBeVisible()
    await narrow.getByRole('textbox', { name: 'Search modules', exact: true }).fill('api')
    await expect(narrow.locator('tbody>tr')).toHaveCount(1)
    await page.screenshot({ path: resolve(output, 'dashboard-modules-localized-narrow.png'), fullPage: true })
    checks.push('Narrow: long localized heading wraps; module query preserves natural two-column table')
    const narrowBoard = await open(page, 9)
    const scroll = narrowBoard.locator('.lumen-dashboard-reference-table-scroll')
    assert(
      await scroll.evaluate((node) => node.scrollWidth > node.clientWidth),
      'Narrow worklog must own horizontal scroll',
    )
    checks.push('Narrow: worklog scroll is confined to its table, not the page')
    await page.setViewportSize({ width: 1192, height: 760 })
    const overflow = await open(page, 8, 'overflow')
    const pane = overflow.locator('.lumen-dashboard-reference-table-scroll')
    await expect(overflow.locator('tbody>tr')).toHaveCount(81)
    assert(await pane.evaluate((node) => node.scrollHeight > node.clientHeight), '81 modules must own vertical scroll')
    await overflow.locator('[data-row-id="capacity-module-80"]').scrollIntoViewIfNeeded()
    await expect(overflow.locator('[data-row-id="capacity-module-80"]')).toBeInViewport()
    await page.screenshot({ path: resolve(output, 'dashboard-modules-overflow.png'), fullPage: true })
    checks.push('Capacity: eighty-one synthetic module rows remain reachable in their declared pane')
    assert(diagnostics.length === 0, `Browser errors: ${diagnostics.join('; ')}`)
    await writeFile(
      resolve(output, 'report.json'),
      JSON.stringify(
        { standard: 'core function + natural layout; no button/theme/viewport matrix', checks, diagnostics },
        null,
        2,
      ),
    )
    console.log(`Dashboard practical verification passed: ${checks.length} records, ${diagnostics.length} diagnostics`)
  } finally {
    await browser.close()
  }
}
await main()
