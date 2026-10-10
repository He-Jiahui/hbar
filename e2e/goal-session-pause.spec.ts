import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient, createRunCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const action of ['stop', 'fail'] as const)
  test(`a session ${action} pauses the Goal and offers resume in the composer`, async ({ browser }) => {
    test.setTimeout(60_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-goal-session-pause-'))
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const { sessionId } = host.ready
      const goals = createGoalPlanCommandClient(host.client)
      const runs = createRunCommandClient(host.client)
      const copy = getShellCopy('zh-CN')
      const objective = 'Verify that pausing the session also pauses its unfinished Goal.'
      await goals.execute('goal.create', { sessionId, objective, tokenBudget: 2000 })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const strip = page.locator('.hbar-session-current-goal .hbar-composer-goal-strip')
      const status = strip.locator('.hbar-composer-goal-status')
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await expect(strip).toContainText(objective)
      await prompt.fill('Retain this unsent draft.')
      const run = await runs.execute(
        'run.submit',
        { sessionId, modelId: 'local-fixture', input: { text: action === 'stop' ? '/slow' : '/fail', images: [] } },
        { idempotencyKey: crypto.randomUUID() },
      )
      if (action === 'stop') {
        await expect(status).toHaveText(copy.session.intent.running)
        await page.getByRole('button', { name: copy.session.prompt.stop, exact: true }).click()
      }
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: run.operationId })).status)
        .toBe(action === 'stop' ? 'cancelled' : 'failed')
      await expect(status).toHaveText(copy.session.intent.statuses.paused)
      await expect(strip.getByRole('button', { name: copy.session.intent.resume, exact: true })).toBeVisible()
      await expect(strip.getByRole('button', { name: copy.session.intent.pause, exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeVisible()
      expect((await goals.execute('goal.get', { sessionId })).goal).toMatchObject({
        status: 'paused',
        timing: { running: false },
      })
      if (action === 'fail')
        expect((await goals.execute('goal.get', { sessionId })).goal?.continuation).toMatchObject({
          phase: 'stopped',
          reason: 'run_failed',
        })
      await expectComposerText(prompt, 'Retain this unsent draft.')
      await page.screenshot({ path: `artifacts/goal-session-pause/${action}-desktop.png` })
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(strip.getByRole('button', { name: copy.session.intent.resume, exact: true })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      expect(await strip.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/goal-session-pause/${action}-narrow.png` })
      await page.reload()
      await expect(status).toHaveText(copy.session.intent.statuses.paused)
      await expect(strip.getByRole('button', { name: copy.session.intent.resume, exact: true })).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
