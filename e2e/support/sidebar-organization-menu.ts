import { expect, type Page } from '@playwright/test'
import type { getShellCopy } from '../../apps/web/src/shell-copy'

/** Select the persisted view from the project header; the brand bell owns notifications. */
export async function selectSidebarOrganization(
  page: Page,
  labels: ReturnType<typeof getShellCopy>['shell']['sort'],
  mode: 'project' | 'recentProject' | 'time',
): Promise<void> {
  const trigger = page.getByTestId('workspace-organization-menu').locator('[data-workspace-menu-trigger]')
  await trigger.click()
  await page
    .getByRole('menu', { name: labels.menu, exact: true })
    .getByRole('menuitem', { name: labels.organization.organize, exact: true })
    .click()
  const name =
    mode === 'project'
      ? labels.organization.byProject
      : mode === 'recentProject'
        ? labels.organization.recentProjects
        : labels.organization.byTime
  await page.getByTestId('workspace-organization-submenu').getByRole('menuitemradio', { name, exact: true }).click()
  await expect(trigger).toBeFocused()
  await expect(page.locator('.hbar-app-react-project-tree')).toHaveAttribute('data-sidebar-organization', mode)
}
