import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient, createRunCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { openSessionTool } from './support/session-tools-menu'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupFixture(root: string) {
  const resolved = await realpath(root)
  if (
    dirname(resolved).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(resolved).startsWith('hbar-live-timers-')
  )
    throw new Error('Refusing cleanup outside owned fixture')
  await rm(resolved, { recursive: true, force: true })
}

test('Goal strip, Goal pane and current Run tick together and settle after cancellation', async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-live-timers-'))
  const context = await browser.newContext({ locale: 'zh-CN' })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4391),
      goalAutoContinue: false,
    })
    const { sessionId } = host.ready
    const goals = createGoalPlanCommandClient(host.client)
    const runs = createRunCommandClient(host.client)
    const copy = getShellCopy('zh-CN')
    await goals.execute('goal.create', {
      sessionId,
      objective: '检查所有进行中计时实时刷新，并验证停止后冻结。',
      tokenBudget: 10_000,
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4392}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const strip = page.locator('.hbar-session-current-goal .hbar-composer-goal-strip')
    const timer = strip.locator('[data-goal-elapsed]')
    await expect(timer).toHaveAttribute('data-goal-elapsed', '0')
    const accepted = await runs.execute(
      'run.submit',
      {
        sessionId,
        modelId: 'local-fixture',
        input: {
          text: '/tool write_file {"path":"unapproved.txt","text":"never written"}',
          images: [],
          approval: 'ask',
        },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
      .toBe('waiting_approval')
    await expect.poll(async () => Number(await timer.getAttribute('data-goal-elapsed'))).toBeGreaterThanOrEqual(2)
    await openSessionTool(page, copy.session.tools, 'goals')
    const metric = page
      .locator('.hbar-app-react-goal-plan-workspace .lumen-compact-metrics > div')
      .filter({ has: page.getByText(copy.goals.goal.elapsed, { exact: true }) })
      .locator('dd')
    await expect(metric).toBeVisible()
    const initialMetric = await metric.textContent()
    await expect.poll(async () => metric.textContent()).not.toBe(initialMetric)
    await openSessionTool(page, copy.session.tools, 'monitoring')
    const runTimer = page.locator('.hbar-session-run-current [data-run-elapsed]')
    await expect(runTimer).toBeVisible()
    const initialRun = Number(await runTimer.getAttribute('data-run-elapsed'))
    await expect
      .poll(async () => Number(await runTimer.getAttribute('data-run-elapsed')))
      .toBeGreaterThan(initialRun + 1000)
    await strip.getByRole('button', { name: copy.session.intent.pause, exact: true }).click()
    const paused = Number(await timer.getAttribute('data-goal-elapsed'))
    await expect.poll(async () => Number(await timer.getAttribute('data-goal-elapsed'))).toBeGreaterThan(paused)
    await page.screenshot({ path: testInfo.outputPath('live-goal-and-run.png') })
    await page.getByRole('button', { name: copy.session.prompt.stop, exact: true }).click()
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
      .toBe('cancelled')
    await expect.poll(async () => (await goals.execute('goal.get', { sessionId })).goal?.timing?.running).toBe(false)
    await expect(timer).toHaveAttribute(
      'data-goal-elapsed',
      String((await goals.execute('goal.get', { sessionId })).goal!.timeUsedSeconds),
    )
    const settled = await timer.textContent()
    const settledRun = await runTimer.getAttribute('data-run-elapsed')
    await page.waitForTimeout(1500)
    await expect(timer).toHaveText(settled ?? '')
    await expect(runTimer).toHaveAttribute('data-run-elapsed', settledRun ?? '')
    await page
      .locator('.hbar-app-react-session-monitoring')
      .getByRole('button', { name: copy.monitoring.close, exact: true })
      .click()
    await page.setViewportSize({ width: 390, height: 900 })
    await expect(strip).toBeVisible()
    expect(await strip.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('settled-goal-narrow.png') })
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupFixture(root)
  }
})
