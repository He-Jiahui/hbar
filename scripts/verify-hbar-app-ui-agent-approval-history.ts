import { expect, type Page } from '@playwright/test'
import {
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
  createHbarAppUiAgentApprovalLocalizedFixtures,
} from '../tests/fixtures/hbar-app-ui-agent-approval-fixtures'

export async function verifyHistoryApproval(page: Page, baseUrl: string): Promise<void> {
  const content = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.history
  const localized = createHbarAppUiAgentApprovalLocalizedFixtures().history
  if (!content || !localized) throw new Error('Missing history fixture')
  const url = (fixture?: string) =>
    `${baseUrl}/?mode=isolated&variant=hbar-app-ui-agent-approval-6${fixture ? `&agentApprovalFixture=${fixture}` : ''}`
  await page.setViewportSize({ width: 1086, height: 600 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  const searchBox = await page.locator('.hbar-app-ui-agent-approval-history-search').boundingBox()
  const rowBox = await page.locator('li').first().boundingBox()
  expect(searchBox).toEqual({ x: 24, y: 64, width: 320, height: 32 })
  expect(rowBox).toEqual({ x: 24, y: 112, width: 1038, height: 57.5 })
  await expect(page.locator('li')).toHaveCount(8)
  await expect(page.getByRole('tab')).toHaveCount(0)
  await page.getByRole('button', { name: 'approved', exact: true }).click()
  await expect(page.locator('li')).toHaveCount(4)
  await page.getByRole('textbox', { name: content.labels.searchLabel }).fill('maya')
  await expect(page.locator('li')).toHaveCount(1)
  await page.getByRole('button', { name: 'skipped', exact: true }).press('Space')
  await expect(page.locator('li')).toHaveCount(0)
  await expect(page.locator('.hbar-app-ui-agent-approval-history-empty')).toContainText(content.labels.emptyDescription)
  await page.getByRole('button', { name: content.labels.clearFilters }).click()
  await expect(page.locator('li')).toHaveCount(8)
  await expect(page.getByRole('textbox')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'all', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: content.labels.export }).press('Enter')
  await expect(page.locator('li')).toHaveCount(8)

  await page.setViewportSize({ width: 286, height: 560 })
  await page.goto(url('localized'), { waitUntil: 'networkidle' })
  await expect(page.locator('h2')).toHaveText(localized.labels.title)
  await page.getByRole('textbox').fill('audit sample')
  await expect(page.locator('.hbar-app-ui-agent-approval-history-empty')).toContainText(
    localized.labels.emptyDescription,
  )
  await page.getByRole('button', { name: localized.labels.clearFilters }).press('Enter')
  await expect(page.locator('li')).toHaveCount(8)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const boxes = await page.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    }),
  )
  expect(
    boxes.every((box, index) =>
      boxes
        .slice(index + 1)
        .every(
          (other) =>
            Math.min(box.right, other.right) <= Math.max(box.left, other.left) ||
            Math.min(box.bottom, other.bottom) <= Math.max(box.top, other.top),
        ),
    ),
  ).toBe(true)
  await page.goto(url('overflow'), { waitUntil: 'networkidle' })
  expect(await page.locator('li').first().boundingBox()).toEqual({ x: 16, y: 144, width: 254, height: 57.5 })
  await expect(page.locator('li')).toHaveCount(32)
  const pane = page.locator('.hbar-app-ui-agent-approval-history-pane')
  await page.locator('li').last().scrollIntoViewIfNeeded()
  expect(await pane.evaluate((element) => element.scrollTop > 0 && element.scrollHeight > element.clientHeight)).toBe(
    true,
  )
  await expect(page.locator('h2')).toBeInViewport()
  await expect(page.getByRole('textbox')).toBeInViewport()
  console.log(
    JSON.stringify({
      historyBehavior: 'passed',
      desktopComposition: true,
      narrowLocalizedRecovery: true,
      paneOverflowRows: 32,
    }),
  )
}
