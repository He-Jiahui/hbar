import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/list-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, mode?: string): Promise<Locator> {
  const query = new URLSearchParams({ variant: `hbar-app-ui-list-${variant}`, mode: 'isolated' })
  if (mode) query.set('listFixture', mode)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-list-${variant}"]`)
  await expect(root.locator('[data-reference-kind]')).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `List${variant} page overflow`,
  )
  checks.push(`List${variant}${mode ? ` ${mode}` : ''}: natural structure without page horizontal overflow`)
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
    const metrics = await open(page, 1)
    await metrics.getByRole('button', { name: 'Show how orders fulfilled is measured', exact: true }).click()
    await expect(metrics.locator('.lumen-list-reference-disclosure')).toContainText('Picked, packed')
    checks.push('Metric definition expands inside its own row')
    const queue = await open(page, 4)
    const handle = queue.getByRole('button', { name: /^Reorder The quiet return/ })
    await handle.press('Space')
    await handle.press('ArrowDown')
    await handle.press('Enter')
    await expect(queue.locator('[data-row-id]').first()).toHaveAttribute('data-row-id', 'accessibility')
    await queue.getByRole('button', { name: 'Reset order', exact: true }).click()
    await expect(queue.locator('[data-row-id]').first()).toHaveAttribute('data-row-id', 'ssr')
    checks.push('Keyboard pickup/move/drop changes stable queue order; Reset restores it')
    const assets = await open(page, 5)
    await assets.getByRole('tab', { name: 'Needs review', exact: true }).click()
    await expect(assets.locator('.lumen-list-reference-collection>li')).toHaveCount(3)
    await assets.getByRole('checkbox', { name: 'Select all', exact: true }).check()
    await expect(assets.locator('.lumen-list-reference-selection-bar')).toContainText('3 selected')
    await assets.getByRole('button', { name: 'Download', exact: true }).click()
    await expect(assets.getByRole('status').last()).toContainText('no external')
    checks.push('Asset selection is scoped to filtered rows; Download intent does not fake a file transfer')
    const deliveries = await open(page, 6)
    await deliveries.getByRole('tab', { name: 'Failed', exact: true }).click()
    await expect(deliveries.locator('[data-row-id]')).toHaveCount(2)
    await deliveries.getByRole('button', { name: /^payout\.paid/ }).click()
    await expect(deliveries.locator('pre').last()).toContainText('Internal server error')
    await deliveries.getByRole('button', { name: 'Replay delivery', exact: true }).click()
    await expect(deliveries.getByRole('status').last()).toContainText('payout')
    await expect(deliveries.locator('[data-row-id="payout"]')).toContainText('500 Server Error')
    await page.screenshot({ path: resolve(output, 'list-deliveries-desktop.png'), fullPage: true })
    checks.push('Delivery filter, owned disclosure and exact replay intent preserve failed response facts')
    const inbox = await open(page, 8)
    await inbox.getByRole('button', { name: 'Archive', exact: true }).first().click()
    await expect(inbox.locator('[data-row-id="mention-priya"]')).toHaveCount(0)
    await inbox.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(inbox.locator('[data-row-id="mention-priya"]')).toBeVisible()
    await inbox.getByRole('button', { name: 'Mark all read', exact: true }).click()
    await expect(inbox.locator('.lumen-list-reference-heading')).toContainText("You're all caught up")
    checks.push('Local archive/Undo restores the same message; Mark all read updates derived unread count')
    const runbook = await open(page, 10)
    const first = runbook.getByRole('checkbox', { name: /^Mark step 1 complete/ })
    const second = runbook.getByRole('checkbox', { name: /^Mark step 2 complete/ })
    await expect(second).toBeDisabled()
    await first.check()
    await expect(second).toBeEnabled()
    await expect(runbook.locator('.lumen-list-reference-progress')).toContainText('1 of 8 steps complete')
    checks.push('Runbook advances the sequential completion frontier without claiming incident recovery')
    const tree = await open(page, 12)
    await tree.getByRole('button', { name: 'Collapse all', exact: true }).click()
    await expect(tree.getByRole('treeitem', { name: /Button\.tsx/ })).toHaveCount(0)
    await tree.getByRole('button', { name: 'Expand all', exact: true }).click()
    await expect(tree.getByRole('treeitem', { name: /Button\.tsx/ })).toBeVisible()
    checks.push('Repository collapse/expand preserves hierarchy and known file metadata')
    await page.setViewportSize({ width: 390, height: 844 })
    const contacts = await open(page, 9)
    await contacts.getByRole('button', { name: 'Jump to W', exact: true }).click()
    await expect(contacts.getByRole('button', { name: 'Email Greta Wallace', exact: true })).toBeInViewport()
    await page.screenshot({ path: resolve(output, 'list-contacts-narrow.png'), fullPage: true })
    checks.push('Narrow alphabet navigation scrolls its contact group into the owning pane')
    const suppliers = await open(page, 7, 'localized')
    await suppliers.getByRole('textbox', { name: 'Search suppliers', exact: true }).fill('Cloud')
    await expect(suppliers.locator('tbody>tr')).toHaveCount(3)
    await suppliers.getByRole('combobox', { name: '视图与报告周期', exact: true }).selectOption('Logistics')
    await expect(suppliers.getByRole('status').first()).toContainText('当前筛选没有记录')
    await suppliers.getByRole('textbox', { name: 'Search suppliers', exact: true }).fill('')
    await expect(suppliers.locator('tbody>tr')).toHaveCount(4)
    await page.screenshot({ path: resolve(output, 'list-suppliers-localized-narrow.png'), fullPage: true })
    checks.push('Narrow long localized heading and query/category intersection recover naturally')
    await page.setViewportSize({ width: 1192, height: 760 })
    const overflow = await open(page, 7, 'overflow')
    const pane = overflow.locator('.lumen-list-reference-table-scroll')
    await expect(overflow.locator('tbody>tr')).toHaveCount(81)
    assert(await pane.evaluate((node) => node.scrollHeight > node.clientHeight), '81 suppliers must own pane scroll')
    await overflow.locator('tbody>tr').last().scrollIntoViewIfNeeded()
    await expect(overflow.locator('tbody>tr').last()).toBeInViewport()
    checks.push('Capacity eighty-one: final supplier remains reachable in pane-owned scrolling')
    assert(diagnostics.length === 0, `Browser errors: ${diagnostics.join('; ')}`)
    await writeFile(
      resolve(output, 'report.json'),
      JSON.stringify(
        {
          standard: 'distinct core mechanisms and representative natural flow; no button/theme/viewport matrix',
          checks,
          diagnostics,
        },
        null,
        2,
      ),
    )
    console.log(`List practical verification passed: ${checks.length} records, ${diagnostics.length} diagnostics`)
  } finally {
    await browser.close()
  }
}
await main()
