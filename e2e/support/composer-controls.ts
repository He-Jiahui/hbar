import { expect, type Locator, type Page } from '@playwright/test'
import type { getShellCopy } from '../../apps/web/src/shell-copy'

/** Controls retain their identity when capacity places them in the shared overflow surface. */
export async function revealComposerControl(
  page: Page,
  control: Locator,
  labels: ReturnType<typeof getShellCopy>['session']['addMenu'],
): Promise<void> {
  if (!(await control.isVisible())) {
    await page.getByRole('button', { name: labels.menu, exact: true }).click()
  }
  await expect(control).toBeVisible()
}

export async function openComposerFeedback(page: Page, copy: ReturnType<typeof getShellCopy>): Promise<void> {
  const surface = page.getByRole('dialog', { name: copy.session.composerFeedback.title, exact: true })
  if (await surface.isVisible()) return
  const trigger = page.locator('.hbar-composer-feedback-trigger')
  await revealComposerControl(page, trigger, copy.session.addMenu)
  await trigger.click()
  await expect(surface).toBeVisible()
}
