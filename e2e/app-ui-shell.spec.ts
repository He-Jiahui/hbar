import { test, expect } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'

test('gallery shell drives real navigation, adapts to narrow layouts and resolves host copy', async ({
  page,
  context,
}) => {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string }
  const auth = await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  expect(auth.ok()).toBe(true)
  await page.goto(fixture.url)
  const shell = page.locator('[data-hbar-app-ui-shell="workbench"]')
  await expect(shell).toBeVisible()
  const navigation = shell.getByRole('navigation', { name: '导航', exact: true })
  await navigation.getByRole('button', { name: '文件', exact: true }).click()
  await expect(navigation.getByRole('button', { name: '文件', exact: true })).toHaveAttribute('aria-current', 'page')
  await shell.getByRole('button', { name: '会话侧栏', exact: true }).click()
  await expect(navigation).not.toBeVisible()
  await shell.getByRole('button', { name: '会话侧栏', exact: true }).click()
  await expect(navigation).toBeVisible()
  await navigation.getByRole('button', { name: '会话', exact: true }).click()
  await mkdir('artifacts/app-ui-integration', { recursive: true })
  await page.screenshot({ path: 'artifacts/app-ui-integration/shell-desktop-dark.png' })

  await page.evaluate(() => {
    const raw = localStorage.getItem('hbar.workbench.v1')
    if (!raw) throw new Error('Workbench settings were not persisted')
    const saved = JSON.parse(raw) as { state: { locale: string; theme: string } }
    saved.state.locale = 'en-US'
    saved.state.theme = 'light'
    localStorage.setItem('hbar.workbench.v1', JSON.stringify(saved))
  })
  await page.reload()
  await expect(shell.getByRole('combobox', { name: 'Select workspace' })).toBeVisible()
  await expect(shell.getByRole('navigation', { name: 'Navigation', exact: true })).toBeVisible()
  await shell.getByRole('button', { name: 'Open command palette', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '命令面板', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(shell.getByRole('combobox', { name: 'Select workspace' })).toBeVisible()
    expect(await shell.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.screenshot({ path: 'artifacts/app-ui-integration/shell-mobile-light.png' })
})
