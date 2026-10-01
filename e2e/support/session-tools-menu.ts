import type { Page } from '@playwright/test'
import type { getShellCopy } from '../../apps/web/src/shell-copy'

type SessionToolsLabels = ReturnType<typeof getShellCopy>['session']['tools']
type SecondaryTool = 'monitoring' | 'agents' | 'goals' | 'settings'

/** Use the actual header entrance; opening a menu never opens or mutates a tool. */
export async function openSessionTool(page: Page, labels: SessionToolsLabels, tool: SecondaryTool): Promise<void> {
  const trigger = page.getByRole('button', { name: labels.more, exact: true })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await page
    .getByRole(tool === 'settings' ? 'menuitem' : 'menuitemcheckbox', { name: labels[tool], exact: true })
    .click()
}
