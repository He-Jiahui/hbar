import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { HbarClient } from '../packages/client/src/index'

test('session sidebar virtualizes real records and confirms rename/archive against the Host', async ({
  page,
  context,
}) => {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string }
  const api = new HbarClient(fixture.url, fixture.token)
  await api.connect()
  try {
    const workspace = (await api.call('system.bootstrap', {})).workspaces[0]!
    for (let index = 0; index < 70; index++)
      await api.call('session.create', { workspaceId: workspace.id, title: `Sidebar record ${index}` })
    await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
    await page.goto(fixture.url)
    const sidebar = page.locator('.hbar-app-ui-session-navigator').filter({ visible: true })
    await expect(sidebar).toBeVisible()
    const search = sidebar.getByRole('searchbox', { name: '搜索会话' })
    await expect(async () => {
      const count = await sidebar.locator('.session-item').count()
      expect(count).toBeGreaterThan(0)
      expect(count).toBeLessThan(70)
    }).toPass()
    await search.fill('Sidebar record 69')
    const row = sidebar.locator('.session-item').filter({ hasText: 'Sidebar record 69' })
    await row.getByRole('button', { name: '重命名 Sidebar record 69', exact: true }).click()
    await sidebar.getByRole('textbox', { name: '会话名称' }).fill('Renamed sidebar record')
    await sidebar.getByRole('button', { name: '保存', exact: true }).click()
    await expect(row).toHaveCount(0)
    await search.fill('Renamed sidebar record')
    const renamed = sidebar.locator('.session-item').filter({ hasText: 'Renamed sidebar record' })
    await expect(renamed).toBeVisible()
    await renamed.getByRole('button', { name: '归档 Renamed sidebar record', exact: true }).click()
    await expect(renamed).toHaveCount(0)
    await sidebar.getByRole('button', { name: '已归档会话', exact: true }).click()
    await expect(renamed).toBeVisible()
    expect(
      (await api.call('system.bootstrap', {})).sessions.find((session) => session.title === 'Renamed sidebar record')
        ?.archived,
    ).toBe(true)
    await renamed.getByRole('button', { name: '恢复 Renamed sidebar record', exact: true }).click()
    await expect(renamed).toHaveCount(0)
    await page.reload()
    await sidebar.getByRole('button', { name: '活动会话', exact: true }).click()
    await search.fill('Renamed sidebar record')
    await expect(renamed).toBeVisible()
    await page.setViewportSize({ width: 320, height: 844 })
    await page.locator('.mobile-nav').getByRole('button', { name: '会话', exact: true }).click()
    await expect(renamed).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    api.disconnect()
  }
})
