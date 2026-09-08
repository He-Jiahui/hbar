import { test, expect, type Locator, type Page, type BrowserContext } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { HbarClient } from '../packages/client/src/index'

async function controller() {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as {
    url: string
    token: string
  }
  const api = new HbarClient(fixture.url, fixture.token)
  await api.connect()
  return { ...fixture, api }
}

async function login(context: BrowserContext, page: Page) {
  const fixture = await controller()
  const response = await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  expect(response.ok()).toBeTruthy()
  await page.goto(fixture.url)
  await expect(page.locator('.app-shell')).toBeVisible()
  return fixture
}

async function visible(locator: Locator) {
  for (let index = 0; index < await locator.count(); index += 1) {
    const candidate = locator.nth(index)
    if (await candidate.isVisible()) return candidate
  }
  throw new Error('Expected a visible locator')
}

test('session capability actions open the Goal, Plan, and Budget panel', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const newSession = await visible(page.locator('button[aria-label="新建会话"]'))
    await newSession.click()
    await expect(page.locator('.chat-panel').filter({ visible: true })).toBeVisible()

    const plus = page.locator('.chat-panel:visible button[aria-label="添加能力"]')
    await expect(plus).toHaveCount(1)
    await plus.click({ force: true })
    await expect(page.getByRole('menuitem', { name: 'Goal 模式', exact: true })).toBeEnabled()
    await page.getByRole('menuitem', { name: 'Goal 模式', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: '会话能力', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox', { name: '目标', exact: true }).fill('完成 capability 面板验收')
    await dialog.getByRole('button', { name: '创建 Goal', exact: true }).click()
    await expect(dialog).toContainText('进行中')

    await dialog.getByRole('button', { name: 'Plan', exact: true }).click()
    await dialog.getByRole('button', { name: 'Plan 模式', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Plan 模式', exact: true })).toHaveClass(/selected/)

    await dialog.getByRole('button', { name: 'Budget', exact: true }).click()
    await dialog.getByRole('spinbutton', { name: 'Token 上限', exact: true }).fill('1000')
    await dialog.getByRole('button', { name: '设置预算', exact: true }).click()
    await expect(dialog).toContainText('预算使用情况')
  } finally {
    fixture.api.disconnect()
  }
})
