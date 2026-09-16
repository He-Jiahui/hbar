import { test, expect, type Locator, type Page, type BrowserContext } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { HbarClient } from '../packages/client/src/index'
import { MAX_PLAN_STEPS } from '../packages/contracts/src/index'

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
  const candidate = locator.filter({ visible: true }).first()
  await expect(candidate).toBeVisible()
  return candidate
}

test('session capability actions open the Goal, Plan, and Budget panel', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const newSession = await visible(page.getByRole('button', { name: '新建会话', exact: true }))
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

test('app-ui plan editor preserves typing, detects remote changes, and scrolls the protocol capacity', async ({
  page,
  context,
}) => {
  const fixture = await login(context, page)
  try {
    const bootstrap = await fixture.api.call('system.bootstrap', {})
    const session = await fixture.api.call('session.create', {
      workspaceId: bootstrap.workspaces[0]!.id,
      title: 'Plan draft recovery',
    })
    await fixture.api.call('plan.update', {
      sessionId: session.id,
      explanation: null,
      plan: [{ step: 'Initial step', status: 'pending' }],
    })
    await page.reload()
    await page.locator('.session-select').filter({ hasText: 'Plan draft recovery' }).click()
    await page.getByRole('button', { name: '添加能力', exact: true }).filter({ visible: true }).click()
    await page.getByRole('menuitem', { name: 'Plan 模式', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '会话能力', exact: true })
    const step = dialog.getByRole('textbox', { name: '计划步骤 1', exact: true })
    await expect(step).toHaveValue('Initial step')
    await step.fill('')
    await step.pressSequentially('Typing stays focused')
    await expect(step).toHaveValue('Typing stays focused')
    await expect(step).toBeFocused()
    await fixture.api.call('plan.update', {
      sessionId: session.id,
      explanation: 'Remote update',
      plan: [{ step: 'Changed on another device', status: 'completed' }],
    })
    await expect(dialog).toContainText('草稿已保留')
    await expect(step).toHaveValue('Typing stays focused')
    await expect(dialog.getByRole('button', { name: '保存计划', exact: true })).toBeDisabled()
    await dialog.getByText('最新已保存计划', { exact: true }).click()
    await expect(dialog).toContainText('Changed on another device')
    await dialog.getByRole('button', { name: '已核对，保留草稿', exact: true }).click()
    await dialog.getByRole('button', { name: '保存计划', exact: true }).click()
    await expect
      .poll(async () => (await fixture.api.call('plan.get', { sessionId: session.id }))?.plan[0]?.step)
      .toBe('Typing stays focused')
    await fixture.api.call('plan.update', {
      sessionId: session.id,
      explanation: null,
      plan: Array.from({ length: MAX_PLAN_STEPS }, (_, index) => ({ step: `Step ${index + 1}`, status: 'pending' })),
    })
    await expect(dialog.getByRole('button', { name: '添加步骤', exact: true })).toBeDisabled()
    const viewport = dialog.locator('.hbar-app-ui-agent-plan-editable-list-viewport')
    expect(
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return element.scrollTop > 0
      }),
    ).toBe(true)
    await expect(dialog.getByRole('button', { name: '保存计划', exact: true })).toBeInViewport()
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(dialog.getByRole('button', { name: '保存计划', exact: true })).toBeInViewport()
    await page.screenshot({ path: 'artifacts/app-ui-integration/plan-mobile.png' })
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await page.reload()
    expect((await fixture.api.call('plan.get', { sessionId: session.id }))?.plan).toHaveLength(MAX_PLAN_STEPS)
  } finally {
    fixture.api.disconnect()
  }
})

test('app-ui budget keeps failed input, detects remote limit changes and confirms saved values after refresh', async ({
  page,
  context,
}) => {
  const fixture = await login(context, page)
  try {
    const bootstrap = await fixture.api.call('system.bootstrap', {})
    const session = await fixture.api.call('session.create', {
      workspaceId: bootstrap.workspaces[0]!.id,
      title: 'Budget recovery',
    })
    await fixture.api.call('budget.set', { sessionId: session.id, limit: 1000 })
    await page.reload()
    await page.locator('.session-select').filter({ hasText: 'Budget recovery' }).click()
    async function openBudget() {
      await page.getByRole('button', { name: '添加能力', exact: true }).filter({ visible: true }).click()
      await page.getByRole('menuitem', { name: 'Budget 模式', exact: true }).click()
    }
    await openBudget()
    const dialog = page.getByRole('dialog', { name: '会话能力', exact: true }),
      limit = dialog.getByRole('spinbutton', { name: 'Token 上限', exact: true })
    await expect(limit).toHaveValue('1000')
    await limit.fill('500')
    await dialog.getByRole('button', { name: '增加上限', exact: true }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(limit).toHaveValue('500')
    await limit.fill('2000')
    await fixture.api.call('budget.set', { sessionId: session.id, limit: 3000 })
    await expect(dialog).toContainText('输入已保留')
    await expect(limit).toHaveValue('2000')
    await expect(dialog.getByRole('button', { name: '增加上限', exact: true })).toBeDisabled()
    await dialog.getByRole('button', { name: '载入最新预算', exact: true }).click()
    await expect(limit).toHaveValue('3000')
    await limit.fill('4000')
    await dialog.getByRole('button', { name: '增加上限', exact: true }).click()
    await expect.poll(async () => (await fixture.api.call('budget.get', { sessionId: session.id }))?.limit).toBe(4000)
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await page.reload()
    await openBudget()
    await expect(limit).toHaveValue('4000')
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'artifacts/app-ui-integration/budget-mobile.png' })
  } finally {
    fixture.api.disconnect()
  }
})
