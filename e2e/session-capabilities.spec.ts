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

test('session capability actions configure inline Goal, Plan, Budget, and unattended state', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const newSession = await visible(page.locator('button[aria-label$=" 中新建会话"]'))
    await newSession.click()
    await expect(page.locator('.chat-panel').filter({ visible: true })).toBeVisible()

    const chat = page.getByRole('tabpanel', { name: 'New session', exact: true })
    const plus = chat.locator('button[aria-label="添加能力"]')
    await expect(plus).toHaveCount(1)
    await expect(plus).toBeVisible()
    await plus.click()
    const capabilityMenu = page.getByRole('menu', { name: '会话能力', exact: true })
    await expect(capabilityMenu).toBeVisible()
    await expect(capabilityMenu).toHaveCSS('position', 'fixed')
    expect(await capabilityMenu.evaluate((element) => element.parentElement === document.body)).toBeTruthy()
    await page.mouse.click(5, 5)
    await expect(capabilityMenu).toHaveCount(0)
    await plus.click()
    await expect(page.getByRole('menuitem', { name: 'Goal 模式', exact: true })).toBeEnabled()
    await page.getByRole('menuitem', { name: 'Goal 模式', exact: true }).click()

    await expect(page.locator('.composer-mode-tag', { hasText: 'Goal · 待设置' })).toBeVisible()
    await plus.click()
    await page.getByRole('menuitem', { name: 'Plan 模式', exact: true }).click()
    await expect(page.locator('.composer-mode-tag', { hasText: 'Plan' })).toBeVisible()
    await plus.click()
    await page.getByRole('menuitem', { name: 'Budget 模式', exact: true }).click()
    await expect(page.getByRole('spinbutton', { name: '预算 token', exact: true })).toBeVisible()
    await page.getByRole('spinbutton', { name: '预算 token', exact: true }).fill('1000')
    await page.getByRole('button', { name: '保存预算', exact: true }).click()
    await expect(page.locator('.composer-mode-tag', { hasText: 'Budget' })).toBeVisible()
  } finally {
    fixture.api.disconnect()
  }
})

test('prompt composer exposes keyboard-navigable slash commands', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const newSession = await visible(page.locator('button[aria-label$=" 中新建会话"]'))
    await newSession.click()
    const chat = page.getByRole('tabpanel', { name: 'New session', exact: true })
    const input = chat.getByRole('textbox', { name: '消息', exact: true })
    await input.fill('/')

    const slashMenu = page.getByRole('listbox', { name: '斜杠命令', exact: true })
    await expect(slashMenu).toBeVisible()
    await expect(slashMenu).toHaveCSS('position', 'fixed')
    expect(await slashMenu.evaluate((element) => element.parentElement === document.body)).toBeTruthy()
    await page.mouse.click(5, 5)
    await expect(slashMenu).toHaveCount(0)
    await input.press('End')
    await input.type('g')
    await input.press('Backspace')
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
    await expect(page.locator('.composer-mode-tag', { hasText: 'Goal · 待设置' })).toBeVisible()
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
