import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('shared command palette uses stable keyboard selection, localized copy and native focus restoration', async ({
  page,
  context,
}) => {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string }
  await context.addInitScript(() =>
    localStorage.setItem(
      'hbar.workbench.v1',
      JSON.stringify({ version: 6, state: { locale: 'en-US', theme: 'light' } }),
    ),
  )
  await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  await page.goto(fixture.url)
  const trigger = page.getByRole('button', { name: 'Open command palette', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Command palette', exact: true }),
    search = dialog.getByRole('searchbox', { name: 'Search commands', exact: true })
  await expect(search).toBeFocused()
  await search.press('ArrowUp')
  await expect(dialog.getByRole('option', { selected: true })).toContainText('Restore default layout')
  await expect(dialog.getByRole('option', { selected: true })).toBeInViewport()
  await search.fill('nothing matches this query')
  await expect(dialog).toContainText('No matching commands')
  await search.press('Enter')
  await expect(dialog).toBeVisible()
  await search.fill('settings')
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'artifacts/app-ui-integration/command-mobile-light.png' })
  await search.press('Enter')
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Appearance', exact: true }).filter({ visible: true })).toBeVisible()
  await trigger.click()
  await search.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})
