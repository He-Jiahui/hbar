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
  for (let index = 0; index < (await locator.count()); index += 1) {
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

    const chat = page.getByRole('tabpanel', { name: 'New session', exact: true })
    const plus = chat.locator('button[aria-label="添加能力"]')
    await expect(plus).toHaveCount(1)
    await expect(plus).toBeVisible()
    await plus.click()
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

test('prompt composer exposes keyboard-navigable slash commands', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const newSession = await visible(page.locator('button[aria-label="新建会话"]'))
    await newSession.click()
    const chat = page.getByRole('tabpanel', { name: 'New session', exact: true })
    const input = chat.getByRole('textbox', { name: '消息', exact: true })
    await input.fill('/')

    const slashMenu = chat.getByRole('listbox', { name: '斜杠命令', exact: true })
    await expect(slashMenu).toBeVisible()
    const options = slashMenu.getByRole('option')
    await expect(options).not.toHaveCount(0)
    await expect(options.first()).toHaveAttribute('aria-selected', 'true')
    await input.press('ArrowDown')
    await expect(options.first()).toHaveAttribute('aria-selected', 'false')
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')

    await input.fill('/goal')
    await expect(options).toHaveCount(1)
    await input.press('Enter')
    await expect(page.getByRole('dialog', { name: '会话能力', exact: true })).toBeVisible()
  } finally {
    fixture.api.disconnect()
  }
})

test('plan tool surface exposes progress and current step state', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const bootstrap = await fixture.api.call('system.bootstrap', {})
    const session = await fixture.api.call('session.create', {
      workspaceId: bootstrap.workspaces[0]!.id,
      title: 'Plan progress UI',
    })
    await fixture.api.call('plan.update', {
      sessionId: session.id,
      plan: [
        { step: 'Inspect the workspace', status: 'completed' },
        { step: 'Apply the layout changes', status: 'in_progress' },
        { step: 'Verify the result', status: 'pending' },
      ],
      explanation: 'Keep the current step visible while the run is active.',
    })
    await page.reload()
    await page.locator('.session-select').filter({ hasText: 'Plan progress UI' }).click()
    await page.getByRole('button', { name: '计划', exact: true }).filter({ visible: true }).click()
    const plan = page.locator('.plan-card').filter({ visible: true })
    await expect(plan.locator('.plan-progress-heading')).toContainText('1 of 3 done')
    await expect(plan.locator('.plan-progress-track')).toHaveAttribute('aria-label', '计划进度 1 / 3')
    await expect(plan.locator('.plan-current-step')).toContainText('Apply the layout changes')
  } finally {
    fixture.api.disconnect()
  }
})
