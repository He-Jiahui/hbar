import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { HbarClient } from '../packages/client/src/index'

async function login(context: BrowserContext, page: Page) {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string }
  const api = new HbarClient(fixture.url, fixture.token)
  await api.connect()
  const response = await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  expect(response.ok()).toBeTruthy()
  await page.goto(fixture.url)
  await expect(page.locator('.app-shell')).toBeVisible()
  return { ...fixture, api }
}

test('model settings can search and filter configured connections', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    await page.getByRole('button', { name: '设置', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: '供应商与模型', exact: true })).toBeVisible()

    const search = page.getByRole('textbox', { name: '搜索供应商或模型', exact: true })
    await search.fill('fixture')
    await expect(page.locator('.model-row')).toHaveCount(1)
    await search.fill('does-not-exist')
    await expect(page.getByText('没有匹配的模型', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    await expect(page.locator('.model-row')).toHaveCount(1)

    await page.getByRole('button', { name: '待配置', exact: true }).click()
    await expect(page.getByText('没有匹配的模型', { exact: true })).toBeVisible()
  } finally {
    fixture.api.disconnect()
  }
})
