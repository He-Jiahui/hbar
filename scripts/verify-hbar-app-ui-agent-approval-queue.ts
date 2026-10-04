import { expect, type Page } from '@playwright/test'
import {
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
  createHbarAppUiAgentApprovalLocalizedFixtures,
} from '../tests/fixtures/hbar-app-ui-agent-approval-fixtures'

export async function verifyQueueApproval(page: Page, baseUrl: string): Promise<void> {
  const content = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.queue
  const localized = createHbarAppUiAgentApprovalLocalizedFixtures().queue
  if (!content || !localized) throw new Error('Missing queue host content')
  const url = (theme: string, fixture?: string) =>
    `${baseUrl}/?mode=isolated&variant=hbar-app-ui-agent-approval-3&theme=${theme}${fixture ? `&agentApprovalFixture=${fixture}` : ''}`
  // The eight pure state paths are covered by unit tests. Browser checks use
  // opposite mixed decisions at the desktop and narrow layout boundaries.
  for (const { width, theme, mask } of [
    { width: 1086, theme: 'dark', mask: 5 },
    { width: 286, theme: 'light', mask: 2 },
  ]) {
    await page.setViewportSize({ width, height: 640 })
    await page.goto(url(theme), { waitUntil: 'networkidle' })
    await expect(page.locator('header')).toContainText('3 waiting')
    for (const [index, item] of content.pending.entries()) {
      const featured = page.locator('.hbar-app-ui-agent-approval-queue-featured')
      await expect(featured.locator('.hbar-app-ui-agent-approval-queue-title')).toHaveText(item.title)
      const show = featured.getByRole('button', { name: content.labels.showRequest, exact: true })
      await expect(show).toHaveAttribute('aria-expanded', 'false')
      // Exercise disclosure where it changes state, not every equivalent button gesture.
      if ((mask + index) % 2 === 0) {
        await show.press('Enter')
        const hide = featured.getByRole('button', { name: content.labels.hideRequest, exact: true })
        await expect(hide).toHaveAttribute('aria-expanded', 'true')
        await expect(featured.locator('pre')).toHaveText(item.requestText ?? '')
        await hide.press('Escape')
        await expect(featured.locator('pre')).toHaveCount(1)
        await page.keyboard.press('Tab')
        await page.keyboard.press('Tab')
        await page.keyboard.press('Tab')
        await expect(featured.locator('pre')).toBeFocused()
        await featured.locator('pre').press('End')
        await hide.press('Space')
        await expect(featured.locator('pre')).toHaveCount(0)
        await show.click()
      }
      const decision = mask & (1 << index) ? 'approved' : 'rejected'
      await featured
        .getByRole('button', {
          name: decision === 'approved' ? content.labels.approve : content.labels.reject,
          exact: true,
        })
        .press('Enter')
      await expect(page.locator(`[data-hbar-app-ui-item-id="${item.id}"]`)).toHaveAttribute(
        'data-hbar-app-ui-state',
        decision === 'approved' ? 'approved' : 'skipped',
      )
      await expect(page.locator('header')).toContainText(`${2 - index} waiting`)
      await expect(page.locator('[aria-live="polite"]')).toHaveText(content.outcomes[decision].announcement)
      await expect(page.locator('ul > li')).toHaveCount(10)
      await expect(page.locator('pre')).toHaveCount(0)
    }
    await expect(page.getByRole('button')).toHaveCount(0)
    await expect(page.locator('header .lumen-agent-approval-state-mark.is-skipped')).toHaveCount(1)
    await expect(page.locator('.hbar-app-ui-agent-approval-queue-featured')).toHaveCount(0)
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error('Queue terminal state overflowed')
  }
  await page.setViewportSize({ width: 286, height: 640 })
  await page.goto(url('light', 'localized'), { waitUntil: 'networkidle' })
  const boxes = await page.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    }),
  )
  if (
    !boxes.every((box, index) =>
      boxes
        .slice(index + 1)
        .every(
          (other) =>
            Math.min(box.right, other.right) <= Math.max(box.left, other.left) ||
            Math.min(box.bottom, other.bottom) <= Math.max(box.top, other.top),
        ),
    )
  )
    throw new Error('Localized queue hit areas overlap')
  await page.getByRole('button', { name: localized.labels.showRequest, exact: true }).click()
  await expect(page.getByRole('button', { name: localized.labels.hideRequest, exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await page.getByRole('button', { name: localized.labels.reject, exact: true }).click()
  await expect(page.locator('header')).toContainText(localized.labels.waiting(2))
  await expect(page.locator('[data-hbar-app-ui-item-id="refund"]')).toContainText(
    localized.outcomes.rejected.stateLabel,
  )
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw new Error('Localized queue overflowed')
  await page.goto(url('dark', 'overflow'), { waitUntil: 'networkidle' })
  await expect(page.locator('ul > li')).toHaveCount(22)
  const scrollable = await page.locator('.hbar-app-ui-agent-approval-queue-pane').evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return element.scrollHeight > element.clientHeight && element.scrollTop > 0
  })
  if (!scrollable) throw new Error('Over-bound queue records did not remain accessible in the pane')
}
