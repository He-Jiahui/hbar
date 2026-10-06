import { expect, test } from '@playwright/test'
import {
  createGoalPlanCommandClient,
  createModelCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { preSessionLaunchCopy } from '../apps/web/src/pre-session-launch-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-goal-plan-coexistence-'))
    throw new Error('Refusing cleanup outside the owned Goal + Plan fixture')
  await rm(target, { recursive: true, force: true })
}

test('Goal and Plan survive first send and explicit approval resumes the original Run', async ({ browser }, info) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-plan-coexistence-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 390, height: 844 } })
  const copy = getShellCopy('zh-CN')
  const labels = preSessionCopy('zh-CN')
  const location = preSessionLaunchCopy('zh-CN').location
  let host: WebSessionHost | undefined
  try {
    // Bound this UI fixture to the first Run; automatic continuation has separate Host coverage.
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      goalAutoContinue: false,
    })
    const originalHost = host
    const sessions = createWorkspaceSessionCommandClient(host.client)
    const goals = createGoalPlanCommandClient(host.client)
    const list = async () =>
      (await sessions.execute('session.list', { workspaceId: originalHost.ready.workspaceId, limit: 100 })).items
    const model = (await createModelCommandClient(host.client).execute('model.list', {})).find(
      (item) => item.id === 'local-fixture',
    )
    if (!model) throw new Error('The owned local fixture model is unavailable')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    const landing = page.locator('.hbar-pre-session-landing')
    const prompt = landing.getByRole('textbox', { name: copy.preSession.prompt.input })
    await landing.locator('.hbar-pre-session-location-picker > button').click()
    const locationRoot = page.getByRole('dialog', { name: location.title, exact: true })
    if (await locationRoot.isVisible())
      await locationRoot.getByRole('button', { name: new RegExp(`^${location.directory}`) }).click()
    await page
      .getByRole('dialog', { name: location.chooseDirectory, exact: true })
      .getByRole('button', { name: new RegExp(host.ready.workspaceName) })
      .click()
    await locationRoot.getByRole('button', { name: location.close, exact: true }).click()
    await landing.getByRole('button', { name: labels.model.trigger(null) }).click()
    await page
      .getByRole('dialog', { name: labels.model.title })
      .getByRole('button', { name: new RegExp(model.modelName) })
      .click()
    const plan = '# 先计划，再执行\n\n- 明确交互入口与当前状态。\n- 批准后在原始任务中实施，保留未发送草稿。'
    const objective = `/tool exit_plan_mode ${JSON.stringify({ plan })}`
    await prompt.fill(objective)
    const prepareGoal = async () => {
      await landing.getByRole('button', { name: copy.session.addMenu.open, exact: true }).click()
      await page
        .getByRole('group', { name: copy.session.addMenu.menu })
        .getByRole('button', { name: copy.session.intent.goalMenu, exact: true })
        .click()
    }
    await prepareGoal()
    const cancelGoal = landing.getByRole('button', { name: copy.session.intent.cancelGoal, exact: true })
    const execution = landing.locator('.hbar-pre-session-approval-picker .hbar-composer-permission-trigger')
    await execution.click()
    await page.locator('.hbar-pre-session-approval-popover [data-choice="plan"]').click()
    await expect(cancelGoal).toBeVisible()
    await expect(execution).toHaveAttribute('data-choice', 'plan')
    await cancelGoal.click()
    await expect(execution).toHaveAttribute('data-choice', 'plan')
    await prepareGoal()
    await expect(cancelGoal).toBeVisible()
    await expect(prompt).toHaveValue(objective)
    expect(await list()).toHaveLength(1)
    await page.screenshot({ path: info.outputPath('goal-plan-prepared-390.png') })
    await landing.getByRole('button', { name: copy.preSession.prompt.send, exact: true }).click()
    await expect.poll(async () => (await list()).length).toBe(2)
    const session = (await list()).find((item) => item.id !== host?.ready.sessionId)
    if (!session) throw new Error('The original first-send Session was not created')
    const sessionId = session.id
    await expect
      .poll(async () =>
        (await originalHost.client.call('session.snapshot', { sessionId })).approvals.some(
          (item) => item.tool === 'exit_plan_mode' && item.status === 'pending',
        ),
      )
      .toBe(true)
    const before = await host.client.call('session.snapshot', { sessionId })
    const run = before.runs.find((item) => item.input.source === 'user')
    const approval = before.approvals.find((item) => item.tool === 'exit_plan_mode' && item.status === 'pending')
    if (!run || !approval) throw new Error('The original Plan Run and approval are missing')
    expect(before.runs).toHaveLength(1)
    expect(run.input.mode).toBe('plan')
    expect(approval.runId).toBe(run.id)
    expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })
    const goal = (await goals.execute('goal.get', { sessionId })).goal
    expect(goal).toMatchObject({ objective, status: 'active', tokensUsed: 0 })
    const strip = page.locator('.hbar-composer-goal-strip')
    await expect(strip).toContainText(objective)
    // JSON newlines in the original instruction are not workspace file targets.
    await expect(page.locator('.hbar-session-message-literal .hbar-message-file-link')).toHaveCount(0)
    const composer = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const draft = '保留下一条未发送草稿；批准计划不能覆盖它。'
    await composer.fill(draft)
    const card = page.locator(`[data-decision-id="${approval.id}"]`)
    await expect(card.getByRole('heading', { name: '先计划，再执行' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: info.outputPath('goal-plan-approval-390.png') })
    await card.getByRole('button', { name: copy.session.decisions.planExit.implement, exact: true }).click()
    await expect(card.getByRole('status')).toHaveText(copy.session.decisions.planExit.implemented)
    await expect
      .poll(
        async () =>
          (await originalHost.client.call('session.snapshot', { sessionId })).runs.find((item) => item.id === run.id)
            ?.status,
      )
      .toBe('completed')
    expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'default' })
    expect((await host.client.call('session.snapshot', { sessionId })).runs.map((item) => item.id)).toEqual([run.id])
    expect((await goals.execute('goal.get', { sessionId })).goal).toMatchObject({
      goalId: goal?.goalId,
      status: 'active',
    })
    await expectComposerText(composer, draft)
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.screenshot({ path: info.outputPath('goal-plan-approved-1440.png') })
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupFixture(root)
  }
})
