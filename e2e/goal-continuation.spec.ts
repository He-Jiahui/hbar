import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient } from '@hbar/client'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { disposeOwnedGoalFixture, selectGoalFixtureSession } from './support/goal-fixture-cleanup'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`persistent Goal continuation has one read-only boundary per real Run: ${locale}`, async ({ browser }) => {
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
      await selectGoalFixtureSession(page, host)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill('Goal continuing is ordinary typed text, not a continuation fact.')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect
        .poll(async () => {
          const snapshot = await selected.client.call('session.snapshot', { sessionId })
          return snapshot.runs.every((run) => run.status === 'completed') && snapshot.runs.length > 0
        })
        .toBe(true)
      const markers = page.locator('[data-goal-continuation-run]')
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
      await expect(markers).toHaveCount(continuationRuns.length)
      for (const run of continuationRuns) {
        const boundary = page.locator(`[data-goal-continuation-run="${run.id}"]`)
        await expect(boundary).toHaveAttribute('role', 'separator')
        await expect(boundary).toHaveAttribute('data-goal-continuation-session', sessionId)
        await expect(boundary).toHaveAttribute('data-run-status', run.status)
        await expect(boundary).toHaveAccessibleName(
          copy.session.goalContinuation.accessible(
            copy.session.goalContinuation.title,
            copy.session.goalContinuation.statuses[run.status],
          ),
        )
        await expect(boundary.getByRole('button')).toHaveCount(0)
        const envelope = snapshot.messages.find((message) => message.runId === run.id && message.role === 'user')
        if (envelope?.content.every((block) => block.type === 'text' && !block.text.trim()))
          await expect(page.locator(`[data-message-id="${envelope.id}"]`)).toHaveCount(0)
      }
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await page.locator('.lumen-conversation-messages').hover()
        await page.mouse.wheel(0, -1)
        await markers.first().scrollIntoViewIfNeeded()
        await expect(markers.first()).toBeInViewport()
        expect(
          await markers
            .first()
            .locator('.hbar-goal-continuation-rule')
            .first()
            .evaluate((node) => Number.parseFloat(getComputedStyle(node).borderBlockStartWidth)),
        ).toBeGreaterThan(0)
        expect(await markers.first().evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/goal-continuation/host-${locale}-${width}.png` })
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      const goals = createGoalPlanCommandClient(selected.client)
      const current = await goals.execute('goal.get', { sessionId })
      await goals.execute('goal.clear', {
        sessionId,
        ...(current.goal?.goalId ? { expectedGoalId: current.goal.goalId } : {}),
      })
      await expect(page.locator('.hbar-composer-goal-strip')).toHaveCount(0)
      await expect(markers).toHaveCount(continuationRuns.length)
      await page.reload()
      await expect(markers).toHaveCount(continuationRuns.length)
      const other = await selected.client.call('session.create', {
        workspaceId: host.ready.workspaceId,
        title: 'Other Goal fixture session',
      })
      await page.reload()
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await page.getByRole('treeitem', { name: other.title, exact: true }).click()
      await expect(markers).toHaveCount(0)
      await page.getByRole('treeitem', { name: snapshot.session.title, exact: true }).click()
      await expect(markers).toHaveCount(continuationRuns.length)
      expect(errors).toEqual([])
    } finally {
      await disposeOwnedGoalFixture(context, host, root, 'hbar-goal-continuation-')
    }
  })
}
