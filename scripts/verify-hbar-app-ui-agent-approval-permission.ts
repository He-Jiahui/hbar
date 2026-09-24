import { expect, type Page } from '@playwright/test'
import {
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
  createHbarAppUiAgentApprovalLocalizedFixtures,
} from '../tests/fixtures/hbar-app-ui-agent-approval-fixtures'

export async function verifyPermissionApproval(page: Page, baseUrl: string): Promise<void> {
  const content = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.permission
  const localized = createHbarAppUiAgentApprovalLocalizedFixtures().permission
  if (!content || !localized) throw new Error('Missing permission host fixture')
  const url = (theme: string, fixture?: string) =>
    `${baseUrl}/?mode=isolated&variant=hbar-app-ui-agent-approval-4&theme=${theme}${fixture ? `&agentApprovalFixture=${fixture}` : ''}`
  await page.setViewportSize({ width: 1086, height: 560 })
  await page.goto(url('dark'), { waitUntil: 'networkidle' })
  await expect(page.locator('h3')).toHaveText(content.requestTitle)
  const card = await page.locator('.hbar-app-ui-agent-approval-permission-card').boundingBox()
  if (
    !card ||
    Math.abs(card.x - 207) > 1 ||
    Math.abs(card.y - 76) > 1 ||
    Math.abs(card.width - 672) > 1 ||
    Math.abs(card.height - 428.5) > 1
  )
    throw new Error(`Permission desktop flow differs from the observed source: ${JSON.stringify(card)}`)
  const checkbox = page.getByRole('checkbox').nth(1)
  await checkbox.press('Space')
  await expect(checkbox).not.toBeChecked()
  await expect(page.locator('.lumen-checkbox').nth(1).locator('.lumen-checkbox-copy > span')).toHaveCSS(
    'text-decoration-line',
    'line-through',
  )
  await page.getByRole('button', { name: content.labels.showRequest, exact: true }).click()
  await expect(page.locator('pre')).toHaveText(content.requestText)
  await expect(page.getByRole('checkbox')).toHaveCount(3)
  await page.getByRole('button', { name: content.labels.approve, exact: true }).press('Space')
  await expect(page.locator('.hbar-app-ui-agent-approval-permission-result')).toHaveText(
    content.outcomes.approved.summary(2, 3),
  )
  await expect(page.locator('[aria-live="polite"]')).toHaveText(content.outcomes.approved.announcement(2))
  await expect(page.getByRole('button')).toHaveCount(0)
  await expect(page.locator('pre')).toHaveCount(0)
  await expect(checkbox).toBeDisabled()

  await page.setViewportSize({ width: 286, height: 560 })
  await page.goto(url('light'), { waitUntil: 'networkidle' })
  for (const scope of await page.getByRole('checkbox').all()) await scope.uncheck()
  await expect(page.getByRole('button', { name: content.labels.approve, exact: true })).toBeDisabled()
  await page.getByRole('checkbox').first().check()
  await expect(page.getByRole('button', { name: content.labels.approve, exact: true })).toBeEnabled()
  await page.getByRole('button', { name: content.labels.showRequest, exact: true }).click()
  await page.locator('pre').press('ArrowRight')
  await expect.poll(() => page.locator('pre').evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  await page.getByRole('button', { name: content.labels.hideRequest, exact: true }).click()
  await page.getByRole('button', { name: content.labels.reject, exact: true }).click()
  await expect(page.locator('.hbar-app-ui-agent-approval-permission-result')).toHaveText(
    content.outcomes.rejected.summary(1, 3),
  )
  await expect(page.getByRole('checkbox').first()).toBeDisabled()

  await page.goto(url('light', 'localized'), { waitUntil: 'networkidle' })
  await expect(page.locator('h3')).toHaveText(localized.requestTitle)
  await page.getByRole('button', { name: localized.labels.showRequest, exact: true }).click()
  const boxes = await page.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect()
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: localized.labels.approve, exact: true }).click()
  await expect(page.locator('.hbar-app-ui-agent-approval-permission-result')).toHaveText(
    localized.outcomes.approved.summary(3, 3),
  )
  await page.goto(url('dark', 'overflow'), { waitUntil: 'networkidle' })
  await expect(page.getByRole('checkbox')).toHaveCount(13)
  const pane = page.locator('.hbar-app-ui-agent-approval-permission-scroll')
  expect(
    await pane.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      return element.scrollTop > 0 && element.scrollWidth <= element.clientWidth
    }),
  ).toBe(true)
  console.log(
    JSON.stringify({
      permission: 'passed',
      referenceGeometry: true,
      partialApproval: true,
      zeroScopeRecovery: true,
      rejection: true,
      localized: true,
      overBound: true,
    }),
  )
}
