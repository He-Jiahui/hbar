import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient, createRunCommandClient } from '@hbar/client'
import { access, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupFixture(root: string) {
  const resolved = await realpath(root)
  if (
    dirname(resolved).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(resolved).startsWith('hbar-goal-running-status-')
  )
    throw new Error('Refusing cleanup outside the owned temporary fixture')
  await rm(resolved, { recursive: true, force: true })
}

test('Goal strip distinguishes paused continuation from the current running session', async ({ browser }) => {
  test.setTimeout(60_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-running-status-'))
  const context = await browser.newContext({ locale: 'zh-CN' })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 49160),
      goalAutoContinue: false,
    })
    const target = host
    const { sessionId } = host.ready
    const copy = getShellCopy('zh-CN')
    const goals = createGoalPlanCommandClient(host.client)
    const runs = createRunCommandClient(host.client)
    const objective = '先核对目标状态与运行状态，再验证长内容自然布局。'.repeat(8)
    const goal = await goals.execute('goal.create', { sessionId, objective, tokenBudget: 2000 })
    const goalId = goal.goal?.goalId
    if (!goalId) throw new Error('Expected confirmed Goal identity')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 49161}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
    const strip = page.locator('.hbar-session-current-goal .hbar-composer-goal-strip')
    const status = strip.locator('.hbar-composer-goal-status')
    await expect(status).toHaveText(copy.session.intent.statuses.active)
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await prompt.fill('不发送的草稿，在暂停和停止后仍应保留。')
    // A local approval holds the real Run without writing or calling a paid model.
    const run = await runs.execute(
      'run.submit',
      {
        sessionId,
        modelId: 'local-fixture',
        input: {
          text: '/tool write_file {"path":"must-not-write.txt","text":"not approved"}',
          images: [],
          approval: 'ask',
        },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: run.operationId })).status)
      .toBe('waiting_approval')
    await expect(status).toHaveText(copy.session.intent.running)
    await strip.getByRole('button', { name: copy.session.intent.pause, exact: true }).click()
    await expect(strip.getByRole('button', { name: copy.session.intent.resume, exact: true })).toBeVisible()
    expect((await goals.execute('goal.get', { sessionId })).goal?.status).toBe('paused')
    expect((await runs.execute('operation.get', { operationId: run.operationId })).status).toBe('waiting_approval')
    await expect(status).toHaveText(copy.session.intent.running)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: 'artifacts/goal-running-reference-v12/hbar-paused-running.png' })
    await page.getByRole('button', { name: copy.session.prompt.stop, exact: true }).click()
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: run.operationId })).status)
      .toBe('cancelled')
    await expect(status).toHaveText(copy.session.intent.statuses.paused)
    await expectComposerText(prompt, '不发送的草稿，在暂停和停止后仍应保留。')
    await page.setViewportSize({ width: 390, height: 900 })
    await expect(strip.getByRole('button', { name: copy.session.intent.resume, exact: true })).toBeInViewport()
    expect(await strip.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: 'artifacts/goal-running-reference-v12/hbar-paused-idle-narrow.png' })
    const other = await target.client.call('session.create', {
      workspaceId: host.ready.workspaceId,
      title: 'Other Goal status fixture',
    })
    await goals.execute('goal.create', { sessionId: other.id, objective: 'Another session is independent' })
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
    await page.getByRole('button', { name: copy.shell.openSession(other.title), exact: true }).click()
    await expect(status).toHaveText(copy.session.intent.statuses.active)
    await expect(strip).not.toContainText(objective)
    await expect(access(join(root, 'project', 'must-not-write.txt'))).rejects.toThrow()
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupFixture(root)
  }
})
