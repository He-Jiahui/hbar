import { expect, type Page } from '@playwright/test'
import {
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
  createHbarAppUiAgentApprovalLocalizedFixtures,
} from '../tests/fixtures/hbar-app-ui-agent-approval-fixtures'

export async function verifyCostApproval(page: Page, baseUrl: string): Promise<void> {
  const content = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.cost
  const localized = createHbarAppUiAgentApprovalLocalizedFixtures().cost
  if (!content || !localized) throw new Error('Missing cost fixture')
  const url = (theme: string, fixture?: string) =>
    `${baseUrl}/?mode=isolated&variant=hbar-app-ui-agent-approval-5&theme=${theme}${fixture ? `&agentApprovalFixture=${fixture}` : ''}`
  await page.setViewportSize({ width: 1086, height: 560 })
  await page.goto(url('dark'), { waitUntil: 'networkidle' })
  const card = page.locator('.hbar-app-ui-agent-approval-cost-card')
  const initial = await card.boundingBox()
  if (
    !initial ||
    Math.abs(initial.x - 287) > 1 ||
    Math.abs(initial.y - 56) > 1 ||
    Math.abs(initial.width - 512) > 1 ||
    Math.abs(initial.height - 448) > 1
  )
    throw new Error(`Cost card differs from observed desktop geometry: ${JSON.stringify(initial)}`)
  await expect(page.locator('dt')).toHaveCount(3)
  await expect(page.locator('dd')).toHaveCount(6)
  await page.getByRole('button', { name: content.labels.showRequest, exact: true }).click()
  await expect(page.locator('pre')).toHaveText(content.requestText)
  await expect(page.locator('dt')).toHaveCount(3)
  await page.getByRole('button', { name: content.labels.approve, exact: true }).press('Space')
  await expect(page.locator('.hbar-app-ui-agent-approval-cost-result')).toHaveText(content.outcomes.approved.summary)
  await expect(page.locator('[aria-live="polite"]')).toHaveText(content.outcomes.approved.announcement)
  await expect(page.getByRole('button')).toHaveCount(0)
  await expect(page.locator('pre')).toHaveCount(0)

  await page.setViewportSize({ width: 286, height: 560 })
  await page.goto(url('light'), { waitUntil: 'networkidle' })
  const narrow = await card.boundingBox()
  if (
    !narrow ||
    Math.abs(narrow.x - 16) > 1 ||
    Math.abs(narrow.y + 40) > 1 ||
    Math.abs(narrow.width - 254) > 1 ||
    Math.abs(narrow.height - 640) > 1
  )
    throw new Error(`Narrow source parity drifted: ${JSON.stringify(narrow)}`)
  // This observed source defect is NOT a no-clipping pass. Keep it visible in
  // the result and withhold whole-variant manual sign-off until resolved.
  const sourceParityHasClippedTop = narrow.y < 0
  await page.getByRole('button', { name: content.labels.showRequest, exact: true }).click()
  await page.getByRole('button', { name: content.labels.hideRequest, exact: true }).click()
  await expect(page.locator('pre')).toHaveCount(0)
  await page.getByRole('button', { name: content.labels.reject, exact: true }).press('Enter')
  await expect(page.locator('.hbar-app-ui-agent-approval-cost-result')).toHaveText(content.outcomes.rejected.summary)
  await expect(page.locator('[aria-live="polite"]')).toHaveText(content.outcomes.rejected.announcement)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.setViewportSize({ width: 286, height: 1100 })
  await page.goto(url('light', 'localized'), { waitUntil: 'networkidle' })
  await expect(page.locator('h2')).toHaveText(localized.labels.title)
  await page.getByRole('button', { name: localized.labels.showRequest, exact: true }).click()
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: localized.labels.reject, exact: true }).click()
  await expect(page.locator('.hbar-app-ui-agent-approval-cost-result')).toHaveText(localized.outcomes.rejected.summary)
  await page.goto(url('dark', 'overflow'), { waitUntil: 'networkidle' })
  await expect(page.locator('dt')).toHaveCount(4)
  await expect(page.locator('dd')).toHaveCount(8)
  console.log(
    JSON.stringify({
      costBehavior: 'passed',
      desktopGeometry: true,
      narrowSourceParity: true,
      sourceParityHasClippedTop,
      narrowNoClippingAcceptance: false,
      localizedNonoverlapAtTallCanvas: true,
      overBoundPreserved: true,
    }),
  )
}
