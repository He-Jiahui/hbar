import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/monitoring-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ variant: `hbar-app-ui-monitoring-${variant}`, mode: 'isolated' })
  if (fixture) query.set('monitoringFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-monitoring-${variant}"]`)
  await expect(root.locator('[data-reference-kind]')).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Monitoring${variant}: page overflow`,
  )
  checks.push(`Monitoring${variant}${fixture ? ` ${fixture}` : ''}: own structure, no page overflow`)
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
    const health = await open(page, 1)
    await expect(health.locator('.lumen-monitoring-reference-metric')).toHaveCount(4)
    await health.getByRole('tab', { name: '1h', exact: true }).click()
    await expect(health.getByRole('tab', { name: '1h', exact: true })).toHaveAttribute('aria-selected', 'true')
    await health.getByRole('tab', { name: '24h', exact: true }).click()
    await expect(health.locator('.lumen-monitoring-reference-metric')).toHaveCount(4)
    await page.screenshot({ path: resolve(output, 'monitoring-health-desktop.png'), fullPage: true })
    const live = await open(page, 2)
    await live.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(live.getByRole('button', { name: 'Resume', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await live.getByRole('tab', { name: 'Errors', exact: true }).click()
    await expect(live.getByRole('tab', { name: 'Errors', exact: true })).toHaveAttribute('aria-selected', 'true')
    const incident = await open(page, 3)
    await incident
      .getByRole('textbox', { name: 'Post an update', exact: true })
      .fill('Core preview update: checkout traffic has recovered.')
    await incident.getByRole('button', { name: 'Post', exact: true }).click()
    await expect(
      incident.getByText('Core preview update: checkout traffic has recovered.', { exact: true }),
    ).toBeVisible()
    await expect(incident.getByRole('status')).toContainText('locally')
    const alerts = await open(page, 4)
    await alerts.getByRole('button', { name: 'Mark resolved', exact: true }).click()
    await expect(alerts.locator('.lumen-monitoring-reference-alert-row')).toHaveCount(2)
    await alerts.getByRole('button', { name: 'Reset states', exact: true }).click()
    await alerts.getByRole('textbox', { name: 'Search alerts', exact: true }).fill('unmatched-core-query')
    await expect(alerts.getByRole('button', { name: 'Clear search', exact: true })).toBeVisible()
    await alerts.getByRole('button', { name: 'Clear search', exact: true }).click()
    await expect(alerts.locator('.lumen-monitoring-reference-alert-row')).toHaveCount(3)
    const logs = await open(page, 5)
    await logs.getByRole('tab', { name: 'Error', exact: true }).click()
    await expect(logs.locator('.lumen-monitoring-reference-log-trigger')).toHaveCount(3)
    await logs.locator('.lumen-monitoring-reference-log-trigger').first().click()
    await expect(logs.locator('.lumen-monitoring-reference-log-context')).toBeVisible()
    await logs.getByRole('button', { name: 'Pause', exact: true }).click()
    await logs.getByRole('button', { name: 'Clear the buffer', exact: true }).click()
    await expect(logs.locator('.lumen-monitoring-reference-log-trigger')).toHaveCount(0)
    const uptime = await open(page, 6)
    await uptime.getByRole('tab', { name: '30d', exact: true }).click()
    await expect(uptime.locator('.lumen-monitoring-reference-days').first().locator('i')).toHaveCount(30)
    const fleet = await open(page, 7)
    await fleet.getByRole('combobox', { name: 'Region', exact: true }).selectOption('us-east-1')
    await fleet.getByRole('textbox', { name: 'Search hosts', exact: true }).fill('worker')
    await expect(fleet.locator('.lumen-monitoring-reference-node-trigger')).toHaveCount(1)
    await expect(fleet.locator('.lumen-monitoring-reference-node-trigger')).toContainText('worker-us-01')
    const response = await open(page, 8)
    await response.getByRole('button', { name: 'GET /v2/orders', exact: true }).click()
    await expect(response.getByRole('button', { name: 'GET /v2/orders', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(response.locator('.lumen-monitoring-reference-metrics')).toContainText('42ms')
    const queue = await open(page, 9)
    await queue.getByRole('button', { name: 'Attention', exact: true }).click()
    await expect(queue.locator('.lumen-monitoring-reference-run-row')).toHaveCount(5)
    await queue.getByRole('button', { name: 'Collapse groups', exact: true }).click()
    await expect(queue.locator('.lumen-monitoring-reference-run-row')).toHaveCount(0)
    await queue.getByRole('button', { name: 'Expand groups', exact: true }).click()
    await queue.getByRole('button', { name: 'New run', exact: true }).click()
    await expect(queue.getByRole('status')).toContainText('requested')
    const slo = await open(page, 10)
    await slo.locator('.lumen-monitoring-reference-objective-trigger').nth(1).click()
    await expect(slo.locator('.lumen-monitoring-reference-slo-chart-header')).toContainText('API latency')
    await expect(slo.locator('.lumen-monitoring-reference-slo-chart-header')).toContainText('64%')
    checks.push(
      'Core scope/pause, local incident post, exact alert resolve/reset, log filter/clear, history window, fleet intersection, route selection, queue groups and SLO projection',
    )
    await page.setViewportSize({ width: 390, height: 844 })
    const narrow = await open(page, 3, 'localized')
    await expect(narrow.getByRole('textbox', { name: '发布更新', exact: true })).toBeVisible()
    await narrow
      .getByRole('textbox', { name: '发布更新', exact: true })
      .fill('生产流量已恢复；这条长事件说明仅保存在本地预览。')
    await narrow.getByRole('button', { name: '在本地预览发布更新', exact: true }).click()
    await page.evaluate(() => {
      document.scrollingElement?.scrollTo(0, 0)
    })
    await expect(
      narrow.getByRole('heading', {
        name: '工作区监控与运行状态 — 长项目名称下的可用性、资源和事件工作台',
        exact: true,
      }),
    ).toBeInViewport()
    await page.screenshot({ path: resolve(output, 'monitoring-incident-localized-narrow.png'), fullPage: true })
    const narrowResponse = await open(page, 8)
    await expect(narrowResponse.getByRole('columnheader', { name: 'p90', exact: true })).toBeHidden()
    await page.screenshot({ path: resolve(output, 'monitoring-response-narrow.png'), fullPage: true })
    await page.setViewportSize({ width: 1192, height: 760 })
    const overflow = await open(page, 5, 'overflow')
    await expect(overflow.locator('.lumen-monitoring-reference-log-trigger')).toHaveCount(140)
    const pane = overflow.locator('.lumen-monitoring-reference-logs')
    assert(await pane.evaluate((node) => node.scrollHeight > node.clientHeight), 'Bounded log buffer must scroll')
    await overflow.locator('.lumen-monitoring-reference-log-trigger').last().scrollIntoViewIfNeeded()
    await expect(overflow.locator('.lumen-monitoring-reference-log-trigger').last()).toBeInViewport()
    checks.push(
      'Bounded 140-line log buffer keeps last row reachable; narrow incident/detail/table flows remain natural',
    )
    assert(!diagnostics.length, `Browser errors: ${diagnostics.join('; ')}`)
    await writeFile(
      resolve(output, 'report.json'),
      JSON.stringify(
        {
          standard: 'core functional and representative natural flow; no repeated button/theme/viewport matrix',
          checks,
          diagnostics,
        },
        null,
        2,
      ),
    )
    console.log(`Monitoring practical verification passed: ${checks.length} records, ${diagnostics.length} diagnostics`)
  } finally {
    await browser.close()
  }
}
await main()
