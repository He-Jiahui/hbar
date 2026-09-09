import { test, expect, type BrowserContext, type Page } from '@playwright/test'
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

test('plan mode renders structured questions and resumes after an answer', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const bootstrap = await fixture.api.call('system.bootstrap', {})
    const session = await fixture.api.call('session.create', {
      workspaceId: bootstrap.workspaces[0]!.id,
      title: 'User input UI',
    })
    await fixture.api.call('mode.set', { sessionId: session.id, mode: 'plan' })

    await page.reload()
    await expect(page.locator('.app-shell')).toBeVisible()
    const sessionButton = page.locator('.session-select').filter({ hasText: 'User input UI' })
    await expect(sessionButton).toBeVisible()
    await sessionButton.click()

    const chat = page.getByRole('tabpanel', { name: 'User input UI', exact: true })
    const input = chat.getByRole('textbox', { name: '消息', exact: true })
    await input.fill(
      '/tool request_user_input {"questions":[{"id":"scope","header":"Scope","question":"Which scope should the plan cover?","options":[{"label":"App","description":"Cover the application flow."},{"label":"API","description":"Cover the API contract."}]}]}',
    )
    await chat.getByRole('button', { name: '发送', exact: true }).click()

    const prompt = page.locator('.user-input-prompt').filter({ visible: true })
    await expect(prompt).toBeVisible()
    await expect(prompt).toContainText('Which scope should the plan cover?')
    await expect(prompt.locator('.user-input-option')).toHaveCount(2)
    await expect(prompt.locator('input[aria-label$="其他答案"]')).toHaveCount(0)
    await expect(prompt.getByRole('button', { name: '提交回答', exact: true })).toHaveClass(/rb-glare-button/)
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-user-input.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(prompt).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-user-input.png` })
    await prompt.locator('input[type="radio"][value="App"]').check()
    await prompt.getByRole('button', { name: '提交回答', exact: true }).click()
    await expect(prompt).toHaveCount(0)

    await expect
      .poll(async () => (await fixture.api.call('session.snapshot', { sessionId: session.id })).userInputs)
      .toHaveLength(0)
    await expect
      .poll(async () => {
        const snapshot = await fixture.api.call('session.snapshot', { sessionId: session.id })
        return snapshot.messages
          .flatMap((message) => message.content)
          .some(
            (block) =>
              block.type === 'tool_result' && block.name === 'request_user_input' && block.text.includes('App'),
          )
      })
      .toBe(true)
  } finally {
    fixture.api.disconnect()
  }
})
