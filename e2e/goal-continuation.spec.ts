import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { openSessionTool } from './support/session-tools-menu'

async function cleanup(root: string) {
  const path = resolve(root)
  if (dirname(path) !== resolve(tmpdir()) || !basename(path).startsWith('hbar-goal-continuation-'))
    throw new Error('Unowned Goal continuation fixture')
  await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`automatic Goal run records live in session status and never add transcript boundaries: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-goal-continuation-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        budgetAutoContinue: false,
      })
      const selected = host
      const { sessionId } = host.ready
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill('Goal continuing is ordinary typed text, not a continuation fact.')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect
        .poll(async () => {
          const snapshot = await selected.client.call('session.snapshot', { sessionId })
          return snapshot.runs.every((run) => run.status === 'completed') && snapshot.runs.length > 0
        })
        .toBe(true)
      const markers = page.locator('.hbar-app-react-session-workspace [data-goal-continuation-run]')
      await expect(markers).toHaveCount(0)
      await prompt.fill('Continue checking this bounded fixture goal.')
      await page.getByRole('button', { name: copy.session.addMenu.open, exact: true }).click()
      await page
        .getByRole('group', { name: copy.session.addMenu.menu })
        .getByRole('button', { name: copy.session.intent.goalMenu, exact: true })
        .click()
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect
        .poll(async () =>
          (await selected.client.call('session.snapshot', { sessionId })).runs.some(
            (run) => run.input.source === 'goal',
          ),
        )
        .toBe(true)
      await page
        .locator('.hbar-composer-goal-strip')
        .getByRole('button', { name: copy.session.intent.pause, exact: true })
        .click()
      await expect
        .poll(async () => {
          const snapshot = await selected.client.call('session.snapshot', { sessionId })
          return snapshot.runs.every((run) => !['queued', 'running', 'waiting_approval'].includes(run.status))
        })
        .toBe(true)
      const snapshot = await selected.client.call('session.snapshot', { sessionId })
      const continuationRuns = snapshot.runs.filter((run) => run.input.source === 'goal')
      expect(continuationRuns.length).toBeGreaterThan(0)
      await expect(markers).toHaveCount(0)
      await openSessionTool(page, copy.session.tools, 'monitoring')
      const pane = page.locator('.hbar-app-react-session-monitoring')
      const activity = pane.locator('.hbar-session-run-activity')
      const history = activity.locator('.hbar-session-run-history')
      const details = history.locator('> .hbar-lumen-disclosure-trigger')
      const revealHistory = async () => {
        await details.click()
        const others = Math.min(80, snapshot.runs.length) - 1
        for (let visible = 20; visible < others; visible += 20)
          await history
            .getByRole('button', { name: copy.session.runs.more(Math.min(20, others - visible)), exact: true })
            .click()
      }
      await revealHistory()
      for (const run of continuationRuns) {
        const record = activity.locator(`[data-run-id="${run.id}"]`)
        await expect(record).toHaveAttribute('data-status', run.status)
        await expect(record).toContainText(copy.monitoring.history.source('goal'))
        await expect(record).toContainText(copy.session.runs.statusLabel(run.status))
        const envelope = snapshot.messages.find((message) => message.runId === run.id && message.role === 'user')
        if (envelope?.content.every((block) => block.type === 'text' && !block.text.trim()))
          await expect(page.locator(`[data-message-id="${envelope.id}"]`)).toHaveCount(0)
      }
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await activity.scrollIntoViewIfNeeded()
        await expect(activity).toBeVisible()
        expect(await pane.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        await expect(markers).toHaveCount(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`goal-runs-in-status-${width}.png`) })
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      const goals = createGoalPlanCommandClient(selected.client)
      const current = await goals.execute('goal.get', { sessionId })
      await goals.execute('goal.clear', {
        sessionId,
        ...(current.goal?.goalId ? { expectedGoalId: current.goal.goalId } : {}),
      })
      await expect(page.locator('.hbar-composer-goal-strip')).toHaveCount(0)
      await expect(markers).toHaveCount(0)
      await page.reload()
      await expect(markers).toHaveCount(0)
      await openSessionTool(page, copy.session.tools, 'monitoring')
      await revealHistory()
      for (const run of continuationRuns)
        await expect(activity.locator(`[data-run-id="${run.id}"]`)).toHaveAttribute('data-status', run.status)
      const other = await createWorkspaceSessionCommandClient(selected.client).execute(
        'session.create',
        {
          workspaceId: host.ready.workspaceId,
          title: 'Other Goal fixture session',
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await page.reload()
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await page.getByRole('treeitem', { name: other.title, exact: true }).click()
      await expect(markers).toHaveCount(0)
      await expect(page.locator('.hbar-app-react-session-workspace .hbar-session-run-activity')).toHaveCount(0)
      await page.getByRole('treeitem', { name: snapshot.session.title, exact: true }).click()
      await expect(markers).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })
}
