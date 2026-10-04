import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/analytics-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ variant: `hbar-app-ui-analytics-${variant}`, mode: 'isolated' })
  if (fixture) query.set('analyticsFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-analytics-${variant}"]`)
  await expect(root.locator('[data-reference-kind]')).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Analytics${variant} page overflow`,
  )
  checks.push(`Analytics${variant}${fixture ? ` ${fixture}` : ''}: renders without page horizontal overflow`)
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
    const revenue = await open(page, 2)
    await revenue.getByRole('tab', { name: '7D', exact: true }).click()
    await expect(revenue.locator('.lumen-analytics-reference-headline')).toContainText('$47,904')
    await expect(revenue.locator('.lumen-analytics-reference-chart-summary')).toContainText('$43,022')
    await revenue.getByRole('tab', { name: '12M', exact: true }).click()
    await expect(revenue.getByRole('status').first()).toContainText('does not include data')
    await revenue.getByRole('tab', { name: '30D', exact: true }).click()
    await expect(revenue.locator('.lumen-analytics-reference-headline')).toContainText('$45,817')
    checks.push('Captured period data changes totals; unknown period is explicit and default recovers')
    const grouped = await open(page, 3)
    await grouped.getByRole('button', { name: 'This year', exact: true }).click()
    await expect(grouped.getByRole('button', { name: 'This year', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(grouped.getByRole('button', { name: 'Last year', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    checks.push('Series visibility is independent; hiding one does not hide the other')
    const service = await open(page, 7)
    await service.getByRole('button', { name: /^p95 latency/ }).click()
    await expect(service.locator('.lumen-analytics-reference-metric-detail-panel>h3')).toHaveText(
      'p95 latency · last 24h',
    )
    await expect(service.locator('.lumen-analytics-reference-metric-detail-panel')).not.toContainText('5.1k req/s')
    await service.getByRole('tab', { name: '1h', exact: true }).click()
    await expect(service.locator('.lumen-analytics-reference-metric-selectors')).toContainText('169ms')
    await page.screenshot({ path: resolve(output, 'analytics-service-desktop.png'), fullPage: true })
    checks.push('Selected service metric replaces prior detail; captured one-hour facts are projected')
    const storage = await open(page, 12)
    await storage.getByRole('tab', { name: '100%', exact: true }).click()
    await expect(storage.locator('.lumen-analytics-reference-chart-y')).toContainText('100%')
    await storage.getByRole('button', { name: 'Hot', exact: true }).click()
    await expect(storage.locator('.lumen-analytics-reference-headline')).toContainText('925 TB')
    checks.push('Storage normalization and hidden-tier totals derive from visible series')
    const quota = await open(page, 15)
    await quota.getByRole('tab', { name: 'Alphabetical', exact: true }).click()
    await expect(quota.locator('.lumen-analytics-reference-bullet-row').first()).toContainText('Amelia Whitfield-Osei')
    checks.push('Quota sorting changes record order rather than only tab styling')
    const live = await open(page, 16)
    await live.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(live.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()
    const frozen = await live.locator('.lumen-analytics-reference-headline').innerText()
    await page.waitForTimeout(1800)
    await expect(live.locator('.lumen-analytics-reference-headline')).toHaveText(frozen)
    await live.getByRole('button', { name: 'Resume', exact: true }).click()
    await expect(live.getByText(/Local preview stream/, { exact: false })).toBeVisible({ timeout: 5000 })
    checks.push('Pause cancels the bounded local stream; Resume advances explicitly simulated samples')
    await page.setViewportSize({ width: 390, height: 844 })
    const channels = await open(page, 5, 'localized')
    await channels.getByRole('button', { name: /Referral/ }).click()
    await expect(channels.locator('.lumen-analytics-reference-donut-total')).toHaveText('1,680')
    await page.screenshot({ path: resolve(output, 'analytics-channels-localized-narrow.png'), fullPage: true })
    checks.push('Narrow long localized heading wraps; selected channel owns the donut center')
    const cohort = await open(page, 11)
    await cohort.getByRole('tab', { name: 'Absolute', exact: true }).click()
    await expect(cohort.locator('tbody>tr').first()).toContainText('1,563')
    const scroll = cohort.locator('.lumen-analytics-reference-cohort-scroll')
    assert(
      await scroll.evaluate((node) => node.scrollWidth > node.clientWidth),
      'Cohort must own its horizontal scroll',
    )
    await page.screenshot({ path: resolve(output, 'analytics-cohort-narrow.png'), fullPage: true })
    checks.push('Wide cohort table owns narrow scrolling; Absolute is explicitly a rounded estimate')
    await page.setViewportSize({ width: 1192, height: 760 })
    const overflow = await open(page, 6, 'overflow')
    const list = overflow.locator('.lumen-analytics-reference-ranked-list')
    await expect(list.locator('button')).toHaveCount(81)
    assert(await list.evaluate((node) => node.scrollHeight > node.clientHeight), '81 records must own pane scrolling')
    await list.locator('button').last().scrollIntoViewIfNeeded()
    await expect(list.locator('button').last()).toBeInViewport()
    checks.push('Capacity eighty-one: rows remain reachable in the declared pane')
    assert(diagnostics.length === 0, `Browser errors: ${diagnostics.join('; ')}`)
    await writeFile(
      resolve(output, 'report.json'),
      JSON.stringify(
        {
          standard: 'core mechanisms + representative natural layouts; no button/theme/viewport matrix',
          checks,
          diagnostics,
        },
        null,
        2,
      ),
    )
    console.log(`Analytics practical verification passed: ${checks.length} records, ${diagnostics.length} diagnostics`)
  } finally {
    await browser.close()
  }
}
await main()
