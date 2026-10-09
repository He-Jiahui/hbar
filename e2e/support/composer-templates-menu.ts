import { expect, type Page } from '@playwright/test'
import type { getShellCopy } from '../../apps/web/src/shell-copy'

export async function openComposerTemplates(
  page: Page,
  labels: ReturnType<typeof getShellCopy>['session']['addMenu'],
  screenshotPath?: string,
): Promise<void> {
  const trigger = page.getByRole('button', { name: labels.open, exact: true })
  await trigger.focus()
  await trigger.press('Enter')
  const menu = page.getByRole('dialog', { name: labels.menu, exact: true })
  await expect(menu).toBeVisible()
  const templates = menu.getByRole('button', { name: labels.templates, exact: true })
  await expect(templates).toBeEnabled()
  const viewport = page.viewportSize()
  const bounds = await menu.boundingBox()
  if (!viewport || !bounds) throw new Error('Composer menu has no visible viewport bounds')
  expect(bounds.x).toBeGreaterThanOrEqual(-1)
  expect(bounds.y).toBeGreaterThanOrEqual(-1)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
  if (screenshotPath) await page.screenshot({ path: screenshotPath })
  await templates.focus()
  await templates.press('Enter')
  await expect(menu).toBeHidden()
}
