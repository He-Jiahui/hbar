import { expect, type Page } from '@playwright/test'
import type { getShellCopy } from '../../apps/web/src/shell-copy'

type SessionToolsLabels = ReturnType<typeof getShellCopy>['session']['tools']
type SessionTool = 'activity' | 'files' | 'monitoring' | 'agents' | 'goals' | 'settings'

/** Use the actual header entrance; opening a menu never opens or mutates a tool. */
export async function openSessionTool(page: Page, labels: SessionToolsLabels, tool: SessionTool): Promise<void> {
  const direct = page.getByRole('button', { name: labels[tool], exact: true })
  if ((tool === 'files' || tool === 'activity') && (await direct.isVisible())) {
    await direct.click()
    return
  }
  const trigger = page.getByRole('button', { name: labels.more, exact: true })
  const mobileTrigger = page.locator('.hbar-mobile-header-menu-trigger')
  await expect.poll(async () => (await trigger.isVisible()) || (await mobileTrigger.isVisible())).toBe(true)
  if (!(await trigger.isVisible())) {
    if ((await mobileTrigger.getAttribute('aria-expanded')) !== 'true') await mobileTrigger.click()
    const surfaceId = await mobileTrigger.getAttribute('aria-controls')
    if (!surfaceId) throw new Error('Mobile header trigger does not identify its surface')
    const surface = page.locator(`[id=${JSON.stringify(surfaceId)}]`)
    await expect(surface).toBeVisible()
    await surface.getByRole('button', { name: labels[tool], exact: true }).click()
    return
  }
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await page
    .getByRole(tool === 'settings' ? 'menuitem' : 'menuitemcheckbox', { name: labels[tool], exact: true })
    .click()
}
