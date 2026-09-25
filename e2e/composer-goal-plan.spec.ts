import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`Goal and Plan use cancellable composer intents and a local goal strip: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-intent-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const { sessionId } = host.ready
      const copy = getShellCopy(locale)
      const labels = copy.session.intent
      const goals = createGoalPlanCommandClient(host.client)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const modes = page.locator('.hbar-composer-intents')
      const objective = 'Verify the composer goal controls — 检查目标操作与当前会话绑定'
      await prompt.fill(objective)
      await modes.getByRole('button', { name: labels.goal, exact: true }).click()
      await expect(prompt).toHaveAttribute('placeholder', labels.goalPlaceholder)
      await expect(modes.getByRole('button', { name: labels.cancelGoal })).toHaveAttribute('aria-pressed', 'true')
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-goal-chip-${locale}.png` })
      await modes.getByRole('button', { name: labels.cancelGoal }).click()
      expect((await goals.execute('goal.get', { sessionId })).goal).toBeNull()
      await expectComposerText(prompt, objective)
      await modes.getByRole('button', { name: labels.plan, exact: true }).click()
      await expect(prompt).toHaveAttribute('placeholder', labels.planPlaceholder)
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-plan-chip-${locale}.png` })
      await modes.getByRole('button', { name: labels.cancelPlan }).click()
      await expectComposerText(prompt, objective)

      await modes.getByRole('button', { name: labels.goal, exact: true }).click()
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      const strip = page.locator('.hbar-composer-goal-strip')
      await expect(strip).toContainText(objective)
      await expectComposerText(prompt, '')
      expect((await goals.execute('goal.get', { sessionId })).goal?.objective).toBe(objective)
      const initialRuns = (await host.client.call('session.snapshot', { sessionId, limit: 60 })).runs
      expect(initialRuns.filter((run) => run.input.source === 'user')).toHaveLength(1)
      expect(initialRuns.find((run) => run.input.source === 'user')?.input.mode).toBe('default')
      await test.info().attach('goal-before-pause-runs', {
        body: JSON.stringify((await host.client.call('session.snapshot', { sessionId, limit: 60 })).runs),
        contentType: 'application/json',
      })
      await strip.getByRole('button', { name: labels.pause, exact: true }).click()
      await expect(strip).toContainText(labels.statuses.paused)
      expect((await goals.execute('goal.get', { sessionId })).goal?.status).toBe('paused')
      await test.info().attach('goal-after-pause-runs', {
        body: JSON.stringify((await host.client.call('session.snapshot', { sessionId, limit: 60 })).runs),
        contentType: 'application/json',
      })
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-goal-paused-${locale}.png` })
      await strip.getByRole('button', { name: labels.resume, exact: true }).click()
      await expect(strip).toContainText(labels.statuses.active)
      await strip.getByRole('button', { name: labels.pause, exact: true }).click()
      await expect(strip).toContainText(labels.statuses.paused)

      await strip.getByRole('button', { name: labels.expand, exact: true }).click()
      const editor = page.getByRole('textbox', { name: copy.goals.goal.objective, exact: true })
      await expect(editor).toHaveValue(objective)
      await editor.fill('This replacement will be discarded')
      await expect(page.getByText(copy.goals.goal.replacementWarning, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.goals.goal.cancel, exact: true }).click()
      await expect(editor).toHaveValue(objective)
      await editor.fill(`${objective}\n\nKeep the changes scoped and verified.`)
      await page.getByRole('button', { name: copy.goals.goal.save, exact: true }).click()
      await expect(page.getByText(copy.goals.goal.saved, { exact: true })).toBeVisible()
      await expect(strip).toContainText('Keep the changes scoped and verified.')
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-goal-document-${locale}.png` })
      await page.getByRole('button', { name: copy.goals.close, exact: true }).click()

      for (const viewport of [
        { width: 1440, height: 960 },
        { width: 390, height: 844 },
        { width: 320, height: 720 },
      ]) {
        await page.setViewportSize(viewport)
        await expect(strip).toBeVisible()
        await expect(strip.getByRole('button', { name: labels.expand, exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-goal-${locale}-${viewport.width}.png` })
      }
      await strip.getByRole('button', { name: labels.clear, exact: true }).click()
      const confirmation = page.getByRole('group', { name: labels.clear, exact: true })
      await confirmation.getByRole('button', { name: labels.cancel, exact: true }).click()
      await expect(strip).toBeVisible()
      await strip.getByRole('button', { name: labels.clear, exact: true }).click()
      await confirmation.getByRole('button', { name: labels.clear, exact: true }).click()
      await expect(strip).toHaveCount(0)
      expect((await goals.execute('goal.get', { sessionId })).goal).toBeNull()

      await prompt.fill('Plan the next task without making changes.')
      await modes.getByRole('button', { name: labels.plan, exact: true }).click()
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expectComposerText(prompt, '')
      const snapshot = await host.client.call('session.snapshot', { sessionId, limit: 60 })
      const planRun = snapshot.runs.find((run) => run.input.text === 'Plan the next task without making changes.')
      expect(planRun?.input.mode).toBe('plan')
      await expect(modes.getByRole('button', { name: labels.plan, exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
      expect((await goals.execute('goal.get', { sessionId })).goal).toBeNull()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
