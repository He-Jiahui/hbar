import { expect, test, type WebSocketRoute } from '@playwright/test'
import { createGoalPlanCommandClient, createRunCommandClient, createUsageCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { openSessionTool } from './support/session-tools-menu'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanup(root: string) {
  const target = await realpath(root)
  if (
    dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(target).startsWith('hbar-monitoring-visuals-')
  )
    throw new Error('Unowned monitoring fixture path')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`session status visualizes real execution, plans and usage with keyboard and narrow layouts: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-monitoring-visuals-'))
    const context = await browser.newContext({
      locale,
      colorScheme: locale === 'zh-CN' ? 'dark' : 'light',
      viewport: { width: 1440, height: 1050 },
    })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        sessionCount: 2,
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const { sessionId } = host.ready
      const client = host.client
      const runs = createRunCommandClient(client)
      const goals = createGoalPlanCommandClient(client)
      const usage = createUsageCommandClient(client)
      const submit = async (text: string, approval: 'ask' | 'allow' = 'allow') =>
        runs.execute(
          'run.submit',
          { sessionId, modelId: 'local-fixture', input: { text, images: [], approval } },
          { idempotencyKey: crypto.randomUUID() },
        )
      for (const text of ['First measured answer', 'Second measured answer', '/fail', 'Recovered answer']) {
        const result = await submit(text)
        await expect
          .poll(async () => (await runs.execute('operation.get', { operationId: result.operationId })).status)
          .toBe(text === '/fail' ? 'failed' : 'completed')
      }
      const prefix = '当前目标 🧭 / Current objective: '
      const objective = prefix + '核对真实执行状态与运行历史。'.repeat(400).slice(0, 4000 - prefix.length)
      await goals.execute('goal.create', { sessionId, objective })
      const active = await submit('/tool write_file {"path":"not-approved.txt","text":"must not be written"}', 'ask')
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: active.operationId })).status)
        .toBe('waiting_approval')
      const baseline = await goals.execute('goal.snapshot', { sessionId })
      const plan = await goals.execute('plan.update', {
        sessionId,
        expectedRevision: baseline.plan?.revision ?? 0,
        turnId: active.operationId,
        explanation: '检查已验证的成果，继续实现当前工作。',
        plan: [
          { step: '已完成：读取实际会话状态 / Completed inspection', status: 'completed' },
          { step: '进行中：检查待审批工具与目标 / Current approval and goal', status: 'in_progress' },
          { step: '待处理：核对完整原文、恢复及最终用量 / Remaining verification', status: 'pending' },
        ],
      })
      const report = await usage.execute('usage.query', {
        scope: { kind: 'session', sessionId, includeDescendants: false },
      })
      const copy = getShellCopy(locale)
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      let offline = false
      const connection: { socket: WebSocketRoute | null } = { socket: null }
      await page.routeWebSocket('**/rpc', async (route) => {
        connection.socket = route
        if (offline) await route.close({ code: 1012, reason: 'Offline fixture' })
        else route.connectToServer()
      })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(origin)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await openSessionTool(page, copy.session.tools, 'monitoring')
      const pane = page.locator('.hbar-app-react-session-monitoring')
      await expect(pane).toBeVisible()
      await expect(pane.locator('.hbar-monitoring-token-timeline'), 'one initial usage chart').toHaveCount(1)
      await expect(pane.locator('.hbar-session-run-current')).toHaveAttribute('data-run-id', active.operationId)
      await expect(pane.locator('.hbar-monitoring-run-overview')).toContainText(copy.session.runs.statusLabel('failed'))
      await expect(page.locator('.hbar-app-react-session-workspace .hbar-session-run-activity')).toHaveCount(0)
      await expect(page.locator('.hbar-app-react-session-workspace .hbar-session-interruption-notice')).toHaveCount(0)
      await expect(pane.locator('.hbar-monitoring-primary-metrics')).toContainText(
        copy.monitoring.number(report.totals.input + report.totals.output),
      )
      await expect(
        pane.getByRole('img', {
          name: copy.monitoring.composition.summary(report.totals.input, report.totals.output),
          exact: true,
        }),
      ).toBeVisible()
      const progress = pane.locator('.hbar-session-run-plan-progress')
      await expect(progress).toHaveAttribute('max', '3')
      await expect(progress).toHaveAttribute('value', '1')
      const planToggle = pane.locator('.hbar-session-run-plan > .hbar-lumen-disclosure-trigger')
      await planToggle.focus()
      await page.keyboard.press('Enter')
      for (const step of plan.plan)
        await expect(pane.locator(`.hbar-session-run-plan [data-status="${step.status}"]`)).toContainText(step.step)
      await planToggle.click()
      const goal = pane.locator('.hbar-monitoring-goal')
      await goal.locator('> .hbar-lumen-disclosure-trigger').click()
      await expect(goal.locator('.hbar-monitoring-objective')).toHaveText(objective)
      await goal.locator('> .hbar-lumen-disclosure-trigger').click()
      const bucket = pane.locator('[data-chart-bucket]').first()
      await expect(
        pane.locator('.hbar-monitoring-token-timeline'),
        'one chart after goal and plan disclosures',
      ).toHaveCount(1)
      await bucket.focus()
      await expect(pane.locator('.hbar-monitoring-token-timeline'), 'one chart after keyboard focus').toHaveCount(1)
      await expect(pane.locator('.hbar-monitoring-chart-caption')).toHaveText(
        (await bucket.getAttribute('aria-label')) ?? '',
      )
      await page.keyboard.press('Tab')
      const requestsToggle = pane.locator('.hbar-monitoring-request-disclosure > .hbar-lumen-disclosure-trigger')
      await expect(requestsToggle).toHaveAttribute('aria-expanded', 'false')
      await expect(pane.locator('.hbar-session-requests')).toHaveCount(0)
      await requestsToggle.click()
      await expect(pane.locator('.hbar-monitoring-token-timeline'), 'one chart after request disclosure').toHaveCount(1)
      await expect(pane.locator('.hbar-session-requests > ul > li').first()).toBeVisible()
      await requestsToggle.click()
      await info.attach('monitoring-structure.json', {
        body: JSON.stringify(
          await pane.evaluate((node) => ({
            charts: [...node.querySelectorAll('.hbar-monitoring-token-timeline')].map((element) => ({
              parent: element.parentElement?.className,
              html: element.outerHTML.slice(0, 2500),
            })),
          })),
          null,
          2,
        ),
        contentType: 'application/json',
      })
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 1050 })
        const body = pane.locator('[data-tool-pane-slot="body"]')
        await body.evaluate((node) => {
          node.scrollTop = 0
        })
        await expect(pane.locator('.hbar-session-run-current')).toBeInViewport()
        expect(await pane.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await pane.screenshot({ path: info.outputPath(`status-overview-${width}.png`) })
        await pane.locator('.hbar-monitoring-token-timeline').scrollIntoViewIfNeeded()
        await pane.screenshot({ path: info.outputPath(`status-usage-${width}.png`) })
      }
      offline = true
      await context.setOffline(true)
      await connection.socket?.close({ code: 1012, reason: 'Offline fixture' })
      await expect(pane.locator('.hbar-session-run-current')).toContainText(copy.session.runs.unconfirmed)
      await expect(pane.locator('.hbar-session-run-current .hbar-session-execution-spinner')).toHaveCount(0)
      offline = false
      await context.setOffline(false)
      await expect(pane.locator('.hbar-session-run-current')).toContainText(
        copy.session.runs.statusLabel('waiting_approval'),
      )
      await page.setViewportSize({ width: 1440, height: 1050 })
      await pane.locator('[data-tool-pane-slot="body"]').evaluate((node) => {
        node.scrollTop = 0
      })
      await pane
        .locator('.hbar-session-run-current')
        .getByRole('button', { name: copy.session.runs.cancelLabel, exact: true })
        .click()
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: active.operationId })).status)
        .toBe('cancelled')
      await expect(page.locator('.hbar-app-react-session-workspace .hbar-session-interruption-notice')).toHaveCount(0)
      const cancelled = (await client.call('session.snapshot', { sessionId })).approvals.find(
        (approval) => approval.runId === active.operationId,
      )
      if (!cancelled || cancelled.status !== 'cancelled') throw new Error('Approval did not settle on cancellation')
      await expect(pane.locator('.hbar-session-decision-history-disclosure')).toBeVisible()
      await expect(
        page.locator('.hbar-app-react-session-workspace .hbar-session-decision-history-disclosure'),
      ).toHaveCount(0)
      await page.reload()
      await openSessionTool(page, copy.session.tools, 'monitoring')
      await expect(pane.locator('.hbar-session-run-current')).toHaveAttribute('data-status', 'cancelled')
      await expect(pane.locator('.hbar-monitoring-run-overview')).toContainText(copy.session.runs.statusLabel('failed'))
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })
}
