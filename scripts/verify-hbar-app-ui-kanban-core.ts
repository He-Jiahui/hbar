import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/kanban-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ mode: 'isolated', variant: `hbar-app-ui-kanban-${variant}` })
  if (fixture) query.set('kanbanFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-kanban-${variant}"]`)
  await expect(root.getByRole('heading').first()).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Kanban${variant}: page overflow`,
  )
  checks.push(`Kanban${variant}${fixture ? ` ${fixture}` : ''}: own structure, no page overflow`)
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
    const board = await open(page, 1)
    await expect(board.getByRole('region')).toHaveCount(4)
    await expect(board.locator('.hbar-app-ui-kanban-reference-card')).toHaveCount(10)
    await board.getByRole('button', { name: 'Add a card to Backlog', exact: true }).click()
    await board.getByRole('textbox', { name: 'New card in Backlog', exact: true }).fill('Core preview task')
    await board.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(board.getByRole('button', { name: /^HAL-242: Core preview task/ })).toHaveCount(1)
    const card = board.getByRole('button', { name: /^HAL-241:/ })
    await card.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')
    await expect(
      board.getByRole('region', { name: 'In progress', exact: true }).getByRole('button', { name: /^HAL-241:/ }),
    ).toHaveCount(1)
    // Locator.press would silently refocus and hide a broken keyboard move.
    await expect(card).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(
      board.getByRole('region', { name: 'Backlog', exact: true }).getByRole('button', { name: /^HAL-241:/ }),
    ).toHaveCount(1)
    await expect(card).toBeFocused()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')
    await expect(card).toBeFocused()
    await page.keyboard.press('Space')
    await expect(board.locator('.is-grabbed')).toHaveCount(0)
    await expect(board.locator('.hbar-app-ui-kanban-reference-announcement')).toHaveText(
      'HAL-241 dropped in In progress.',
    )
    // One native drag sample checks the repaired column-wide drop target.
    await board
      .getByRole('button', { name: /^HAL-229:/ })
      .dragTo(board.getByRole('region', { name: 'Done', exact: true }))
    await expect(
      board.getByRole('region', { name: 'Done', exact: true }).getByRole('button', { name: /^HAL-229:/ }),
    ).toHaveCount(1)
    await expect(board.locator('.is-grabbed')).toHaveCount(0)
    await page.screenshot({ path: resolve(output, 'kanban-board-desktop.png'), fullPage: true })
    checks.push('Board: unique local add, retained keyboard focus, Escape rollback and committed drop')

    const lanes = await open(page, 2)
    await expect(lanes.locator('.hbar-app-ui-kanban-swimlane-card')).toHaveCount(11)
    await lanes.getByRole('button', { name: 'Collapse all', exact: true }).click()
    await expect(lanes.locator('.hbar-app-ui-kanban-swimlane-card')).toHaveCount(0)
    await lanes.getByRole('button', { name: 'Expand all', exact: true }).click()
    const laneCard = lanes.getByRole('button', { name: /^HAL-231:/ })
    await laneCard.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')
    await expect(laneCard).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(laneCard).toBeFocused()
    await page.keyboard.press('Space')
    await expect(
      lanes.locator('section[aria-label="Identity"]').getByRole('button', { name: /^HAL-231:/ }),
    ).toHaveCount(1)
    checks.push('Swimlanes: disclosure and cross-stage/cross-lane keyboard move preserve the card')

    const regroup = await open(page, 3)
    await regroup.getByRole('tab', { name: 'Assignee', exact: true }).click()
    const groupedCard = regroup.getByRole('button', { name: /^NW-408:/ })
    await groupedCard.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')
    await expect(groupedCard).toBeFocused()
    await page.keyboard.press('Space')
    await expect(
      regroup.locator('section[aria-label="Priya Nandakumar"]').getByRole('button', { name: /^NW-408:/ }),
    ).toHaveCount(1)
    await regroup.getByRole('tab', { name: 'Status', exact: true }).click()
    await expect(regroup.locator('section[aria-label="Triage"]').getByRole('button', { name: /^NW-408:/ })).toHaveCount(
      1,
    )
    await expect(regroup.locator('.hbar-app-ui-kanban-regroup-card')).toHaveCount(9)
    checks.push('Regroup: reassignment changes only the selected field; status and card count survive')

    const detail = await open(page, 4)
    const pane = detail.locator('aside[aria-label="CDR-118 details"]')
    await expect(pane).toContainText('Large uploads restart from zero')
    await pane.getByRole('button', { name: 'In review', exact: true }).click()
    await expect(pane.getByRole('button', { name: 'In review', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(pane).toContainText('Ana Reyes')
    await pane.getByRole('button', { name: 'Close details', exact: true }).click()
    await detail.getByRole('button', { name: /^CDR-109:/ }).click()
    await expect(detail.locator('aside')).toContainText('Owners want an expiry they can set once')
    await expect(detail.locator('aside')).not.toContainText('Large uploads restart from zero')
    await detail.locator('aside').getByRole('button', { name: 'Close details', exact: true }).click()
    await detail.getByRole('button', { name: /^CDR-98:/ }).click()
    await expect(detail.locator('aside')).toContainText('The reference snapshot does not include this card’s')
    await expect(detail.locator('aside')).not.toContainText('No comments yet')
    await page.screenshot({ path: resolve(output, 'kanban-detail-desktop.png'), fullPage: true })
    checks.push('Details: exact record selection and stage change preserve record-owned properties/activity')

    const sprint = await open(page, 5)
    await expect(sprint.locator('.hbar-app-ui-kanban-sprint-summary')).toContainText('44 pts')
    const sprintCard = sprint.getByRole('button', { name: /^MER-52:/ })
    await sprintCard.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')
    await expect(sprintCard).toBeFocused()
    await page.keyboard.press('Space')
    await expect(sprint.locator('section[aria-label="Building"]')).toContainText('18 / 13 pts')
    await expect(sprint.locator('.hbar-app-ui-kanban-sprint-card')).toHaveCount(10)
    checks.push('Sprint: keyboard moves recompute capacities from the same cards')

    await page.setViewportSize({ width: 390, height: 844 })
    const compact = await open(page, 6)
    await compact.getByRole('tab', { name: 'Today 2', exact: true }).click()
    await compact.getByRole('button', { name: 'Move Reconcile refund webhooks to Doing', exact: true }).click()
    await expect(compact.getByRole('tab', { name: 'Today 1', exact: true })).toHaveAttribute('aria-selected', 'true')
    await compact.getByRole('tab', { name: 'Doing 3', exact: true }).click()
    await expect(compact.getByRole('button', { name: /^Reconcile refund webhooks/ })).toBeVisible()
    await page.screenshot({ path: resolve(output, 'kanban-compact-narrow.png'), fullPage: true })
    checks.push('Compact narrow: adjacent arrow move updates counts and remains reachable through column tabs')

    const localized = await open(page, 4, 'localized')
    await expect(localized.getByRole('heading', { name: '交付看板', exact: true })).toBeVisible()
    await expect(localized.locator('aside')).toContainText('核对本月发票与付款记录。')
    await page.screenshot({ path: resolve(output, 'kanban-detail-localized-narrow.png'), fullPage: true })
    await page.setViewportSize({ width: 1192, height: 760 })
    const overflow = await open(page, 1, 'overflow')
    const list = overflow.getByRole('region', { name: 'Backlog', exact: true }).locator('ul')
    assert(
      await list.evaluate((node) => node.scrollHeight > node.clientHeight),
      'Long board must own its column scroll',
    )
    await list.getByRole('button').last().scrollIntoViewIfNeeded()
    await expect(list.getByRole('button').last()).toBeInViewport()
    checks.push('Representative bounds: localized narrow details and overflowing column stay usable')
    assert(!diagnostics.length, `Browser errors: ${diagnostics.join('; ')}`)
    await writeFile(
      resolve(output, 'report.json'),
      JSON.stringify(
        {
          standard: 'core workflows and representative natural flow; no repeated button/theme/viewport matrix',
          checks,
          diagnostics,
        },
        null,
        2,
      ),
    )
    console.log(`Kanban practical verification passed: ${checks.length} records, ${diagnostics.length} diagnostics`)
  } finally {
    await browser.close()
  }
}
await main()
