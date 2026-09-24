import { expect, test } from '@playwright/test'
import { createBudgetCommandClient, createGoalPlanCommandClient, createRunCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test('Goal panel matches Host budgets and stop state, with a read-only Agent Plan and guarded completion', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-ui-'))
  let host: WebSessionHost | undefined
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  try {
    host = await startWebSessionHost({ root })
    const sessionId = host.ready.sessionId
    const goals = createGoalPlanCommandClient(host.client)
    const runs = createRunCommandClient(host.client)
    await runs.execute(
      'run.submit',
      {
        sessionId,
        modelId: 'local-fixture',
        input: {
          text: '/tool update_plan {"plan":[{"step":"Verify the durable session state","status":"in_progress"}]}',
          images: [],
        },
      },
      { idempotencyKey: 'publish-plan' },
    )
    await expect
      .poll(async () => (await goals.execute('plan.get', { sessionId }))?.plan[0]?.step)
      .toBe('Verify the durable session state')
    await createBudgetCommandClient(host.client).execute(
      'session.setBudget',
      { sessionId, tokens: 120000 },
      { idempotencyKey: 'allowance' },
    )
    await goals.execute('goal.create', { sessionId, objective: 'Verify visible Goal state', tokenBudget: 200000 })
    await runs.execute(
      'run.submit',
      { sessionId, modelId: 'local-fixture', input: { text: 'Report current progress.', images: [] } },
      { idempotencyKey: 'stop-without-tools' },
    )
    await expect
      .poll(async () => (await goals.execute('goal.get', { sessionId })).goal?.continuation?.reason)
      .toBe('no_tool_calls')
    const fact = (await goals.execute('goal.get', { sessionId })).goal!
    expect(fact.executionBudget?.limitingSource).toBe('session')
    const authenticated = await context.request.post(
      `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}/auth/token`,
      { data: { token: host.ready.token } },
    )
    expect(authenticated.ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`)
    await page.getByRole('button', { name: /^Open session / }).click()
    await page.getByRole('button', { name: 'Goals and plans', exact: true }).click()
    const panel = page.locator('.hbar-app-react-goal-plan-workspace')
    await expect(panel.getByText('Verify the durable session state', { exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Edit plan' })).toHaveCount(0)
    await expect(panel.getByRole('button', { name: 'Clear plan' })).toHaveCount(0)
    await expect(panel.getByText('Stopped · No tool calls; idle continuation suppressed')).toBeVisible()
    const execution = panel.locator('.hbar-app-react-goal-execution')
    await expect(execution).toContainText('Goal remaining tokens')
    await expect(execution).toContainText('Session remaining tokens')
    await expect(execution).toContainText('Effective remaining tokens')
    await expect(execution).toContainText('Session budget')
    await expect(execution).toContainText(
      new Intl.NumberFormat('en-US').format(fact.executionBudget!.effectiveRemainingTokens!),
    )
    await page.screenshot({ path: 'artifacts/session-autonomy/goal-desktop.png', fullPage: true })
    await panel.getByRole('button', { name: 'Edit goal' }).click()
    const status = panel.getByRole('combobox', { name: 'Goal status' })
    await expect(status.locator('option')).toHaveCount(3)
    await status.selectOption('complete')
    await panel.getByRole('button', { name: 'Save goal' }).click()
    await expect(panel.getByRole('alert')).toBeVisible()
    expect((await goals.execute('goal.get', { sessionId })).goal?.status).toBe('active')
    await panel.getByRole('button', { name: 'Back to goals and plans' }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(execution).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: 'artifacts/session-autonomy/goal-mobile.png', fullPage: true })
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
