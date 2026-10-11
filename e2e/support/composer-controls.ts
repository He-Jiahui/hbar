import { expect, type Locator, type Page } from '@playwright/test'
import type { getShellCopy } from '../../apps/web/src/shell-copy'

/** Controls retain their identity when capacity places them in the shared overflow surface. */
export async function revealComposerControl(
  page: Page,
  control: Locator,
  labels: ReturnType<typeof getShellCopy>['session']['addMenu'],
): Promise<void> {
  // Capacity measurement may move an initially visible control into overflow.
  await expect(async () => {
    if (!(await control.isVisible())) {
      const trigger = page.getByRole('button', { name: labels.menu, exact: true })
      if ((await trigger.isVisible()) && (await trigger.getAttribute('aria-expanded')) !== 'true') {
        await trigger.click()
      }
    }
    await expect(control).toBeVisible({ timeout: 250 })
  }).toPass({ timeout: 10_000, intervals: [50, 100, 200] })
}

export async function openComposerFeedback(page: Page, copy: ReturnType<typeof getShellCopy>): Promise<void> {
  const surface = page.getByRole('dialog', { name: copy.session.composerFeedback.title, exact: true })
  if (await surface.isVisible()) return
  const trigger = page.locator('.hbar-composer-feedback-trigger')
  await revealComposerControl(page, trigger, copy.session.addMenu)
  await trigger.click()
  await expect(surface).toBeVisible()
}
