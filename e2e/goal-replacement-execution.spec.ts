import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient, createRunCommandClient } from '@hbar/client'
import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupFixture(root: string) {
  const resolved = await realpath(root)
  if (
    dirname(resolved).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(resolved).startsWith('hbar-goal-replacement-entry-')
  )
    throw new Error('Refusing cleanup outside the owned Goal entry fixture')
  await rm(resolved, { recursive: true, force: true })
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`confirmed /goal replacement hands off active and idle execution once: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-goal-replacement-entry-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45488) })
      const target = host
      const { sessionId } = host.ready
      const goals = createGoalPlanCommandClient(host.client)
      const runs = createRunCommandClient(host.client)
      const original = (await goals.execute('goal.create', { sessionId, objective: 'Original task 原始任务' })).goal
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45487}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const pending = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: {
            text: '/tool write_file {"path":"obsolete.txt","text":"must not execute"}',
            images: [],
            approval: 'ask',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await target.client.call('session.snapshot', { sessionId })).approvals.length)
        .toBe(1)
      await expect(page.getByRole('button', { name: copy.session.prompt.stop, exact: true })).toBeVisible()

      const activeObjective = 'Replacement task 新目标 🧭'
      await prompt.fill(`/goal ${activeObjective}`)
      const queue = page.getByRole('button', { name: copy.session.runningActions.queueLabel, exact: true })
      await expect(queue).toBeEnabled()
      await queue.click()
      const confirmation = page.locator('.hbar-composer-goal-confirmation')
      await expect(confirmation).toContainText(original!.objective)
      await confirmation.getByRole('button', { name: copy.session.slash.goalConfirm, exact: true }).click()
      await expectComposerText(prompt, '')
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: pending.operationId })).status)
        .toBe('completed')
      await expect
        .poll(async () => {
          const snapshot = await target.client.call('session.snapshot', { sessionId })
          return snapshot.runs.filter((run) => run.input.source === 'goal' && run.status === 'completed').length
        })
        .toBe(1)
      let snapshot = await host.client.call('session.snapshot', { sessionId })
      expect(snapshot.runs).toHaveLength(2)
      expect(snapshot.runs.find((run) => run.id === pending.operationId)?.error).toBeNull()
      expect(snapshot.approvals.filter((approval) => approval.status === 'pending')).toHaveLength(0)
      expect(snapshot.approvals[0]?.status).toBe('cancelled')
      expect(existsSync(join(root, 'obsolete.txt'))).toBe(false)
      const activeGoal = (await goals.execute('goal.get', { sessionId })).goal
      expect(activeGoal?.objective).toBe(activeObjective)
      expect(activeGoal?.goalId).not.toBe(original?.goalId)
      expect(snapshot.runs.find((run) => run.input.source === 'goal')?.input.continuation?.goalId).toBe(
        activeGoal?.goalId,
      )

      await prompt.fill('/goal Idle replacement 空闲转向')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await confirmation.getByRole('button', { name: copy.session.slash.goalConfirm, exact: true }).click()
      await expectComposerText(prompt, '')
      await expect
        .poll(async () => {
          const value = await target.client.call('session.snapshot', { sessionId })
          return value.runs.filter((run) => run.input.source === 'goal' && run.status === 'completed').length
        })
        .toBe(2)
      snapshot = await host.client.call('session.snapshot', { sessionId })
      expect(snapshot.runs).toHaveLength(3)
      expect(snapshot.runs.every((run) => run.status === 'completed' && run.error === null)).toBe(true)
      expect(snapshot.runs.filter((run) => run.input.source === 'user')).toHaveLength(1)
      await page.screenshot({ path: `artifacts/goal-replacement/entry-${locale}-1440.png` })
      await page.setViewportSize({ width: 320, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/goal-replacement/entry-${locale}-320.png` })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupFixture(root)
    }
  })
}
