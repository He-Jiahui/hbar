import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient, createRunCommandClient } from '@hbar/client'
import type { PlanStep } from '@hbar/contracts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-session-status-context-'
async function cleanupFixture(root: string) {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith(prefix))
    throw new Error('Refusing cleanup outside owned Session context fixture')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`docked Goal and Plan disclosure follows Activity and its original Session: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 }, colorScheme: 'dark' })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        sessionCount: 2,
        goalAutoContinue: false,
      })
      const { sessionId } = host.ready
      const client = host.client
      const goals = createGoalPlanCommandClient(client)
      const runs = createRunCommandClient(client)
      const copy = getShellCopy(locale)
      const labels = copy.session.liveStatus
      const goalLabels = copy.session.intent
      const objective = '统一目标与计划的完成状态，保留现有文件改动，并验证中文与键盘操作 🧭。'
      const steps: PlanStep[] = [
        { step: '理解当前目标与已经完成的工作', status: 'completed' },
        { step: '把计划进度纳入输入框上方的会话状态，让长文本自然换行并保留可访问名称 🧭', status: 'in_progress' },
        { step: '验证窄屏、会话切换与刷新恢复', status: 'pending' },
      ]
      await goals.execute('goal.create', { sessionId, objective })
      await goals.execute('plan.update', {
        sessionId,
        plan: steps,
        explanation: '当前计划与右侧活动共享同一份 Host 数据。',
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const status = page.locator('.hbar-app-react-session-footer > .hbar-session-live-status[data-visible="true"]')
      const details = status.locator('.hbar-session-live-status-details')
      const strip = status.locator('.hbar-composer-goal-strip')
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = '这段原稿不能被查看计划、暂停目标或切换面板操作发送。'
      await prompt.fill(draft)
      await expect(status.getByRole('button', { name: labels.expand, exact: true })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      await expect(strip).toContainText(objective)
      await expect(status).toContainText(labels.tasks.progress(1, 3))
      await expect(details).toBeHidden()
      await expect(page.locator('.hbar-app-react-session-workspace > .hbar-session-current-goal')).toHaveCount(0)
      await expect(page.locator('.lumen-conversation-messages .hbar-session-run-plan-context')).toHaveCount(0)
      const initialRuns = (await client.call('session.snapshot', { sessionId })).runs.length
      await page.screenshot({ path: info.outputPath(`context-${locale}-collapsed.png`) })

      await status.getByRole('button', { name: labels.expand, exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(details).toBeVisible()
      await expect(details.getByRole('listitem')).toHaveCount(3)
      await expect(details.getByRole('progressbar')).toHaveAttribute('value', '1')
      await expect(details.locator('.hbar-session-live-status-objective')).toContainText(objective)
      await page.getByRole('button', { name: copy.session.tools.activity, exact: true }).click()
      const activity = page.locator('.hbar-session-activity-workspace')
      const activityTasks = activity.locator('.hbar-activity-tasks')
      await expect(activityTasks.getByRole('listitem')).toHaveCount(3)
      const states = (locator: typeof details) =>
        locator
          .locator('[data-activity-task-status]')
          .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-activity-task-status')))
      expect(await states(details)).toEqual(await states(activityTasks))
      await goals.execute('plan.update', { sessionId, plan: steps.map((step) => ({ ...step, status: 'completed' })) })
      await expect(details.getByRole('progressbar')).toHaveAttribute('value', '3')
      await expect(activityTasks.getByRole('progressbar')).toHaveAttribute('value', '3')
      await page.screenshot({ path: info.outputPath(`context-${locale}-activity-parity.png`) })
      await activity.getByRole('button', { name: copy.activity.close, exact: true }).click()
      await expectComposerText(prompt, draft)
      expect((await client.call('session.snapshot', { sessionId })).runs.length).toBe(initialRuns)

      await strip.getByRole('button', { name: goalLabels.pause, exact: true }).click()
      await expect(strip).toContainText(goalLabels.statuses.paused)
      expect((await goals.execute('goal.get', { sessionId })).goal?.status).toBe('paused')
      await strip.getByRole('button', { name: goalLabels.resume, exact: true }).click()
      await expect(strip).toContainText(goalLabels.statuses.active)
      const original = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: {
            text: '/tool write_file {"path":"unapproved-context.txt","text":"never approve"}',
            images: [],
            approval: 'ask',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect(status).toHaveAttribute('data-session-live-status', original.operationId)
      await expect(status).toHaveAttribute('data-run-status', 'waiting_approval')
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(status).toBeInViewport()
        await expect(prompt).toBeInViewport()
        expect(await status.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`context-${locale}-${width}-expanded.png`) })
        await status.getByRole('button', { name: labels.collapse, exact: true }).click()
        await expect(details).toBeHidden()
        await page.screenshot({ path: info.outputPath(`context-${locale}-${width}-collapsed.png`) })
        await status.getByRole('button', { name: labels.expand, exact: true }).click()
      }
      await page
        .locator('.lumen-prompt-composer')
        .getByRole('button', { name: copy.session.prompt.stop, exact: true })
        .click()
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: original.operationId })).status)
        .toBe('cancelled')
      await expect(status).not.toHaveAttribute('data-run-status', 'waiting_approval')
      await expect(details).toBeVisible()

      await goals.execute('plan.update', {
        sessionId,
        plan: Array.from({ length: 100 }, (_, index) => ({ step: `容量边界任务 ${index + 1}`, status: 'pending' })),
      })
      await expect(details.getByRole('listitem')).toHaveCount(100)
      expect(await details.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
      await details.getByRole('listitem').last().scrollIntoViewIfNeeded()
      await expect(details.getByRole('listitem').last()).toBeInViewport()
      await expect(prompt).toBeInViewport()
      await expect(
        goals.execute('plan.update', {
          sessionId,
          plan: Array.from({ length: 101 }, (_, index) => ({ step: `超出容量任务 ${index + 1}`, status: 'pending' })),
        }),
      ).rejects.toThrow()

      await page.setViewportSize({ width: 1440, height: 960 })
      const sidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await sidebar.isVisible()) await sidebar.click()
      await page.getByRole('treeitem', { name: 'Session 001', exact: true }).click()
      await expect(status).toHaveCount(0)
      const currentTitle = (await client.call('session.snapshot', { sessionId })).session.title
      await page.getByRole('treeitem', { name: currentTitle, exact: true }).click()
      await expect(status.getByRole('button', { name: labels.expand, exact: true })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      await expectComposerText(prompt, draft)
      await page.reload()
      await expect(status.getByRole('button', { name: labels.expand, exact: true })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      await status.getByRole('button', { name: labels.expand, exact: true }).click()
      await expect(details.getByRole('listitem')).toHaveCount(100)

      const priorGoal = (await goals.execute('goal.get', { sessionId })).goal
      if (!priorGoal?.goalId) throw new Error('Missing original Goal identity')
      const longGoal = objective.repeat(140).slice(0, 4000)
      await goals.execute('goal.set', { sessionId, expectedGoalId: priorGoal.goalId, objective: longGoal })
      await expect(strip).toContainText(longGoal)
      await expect(details.locator('.hbar-session-live-status-objective')).toContainText(longGoal)
      await goals.execute('plan.update', { sessionId, plan: steps })
      await expect(details.getByRole('listitem')).toHaveCount(3)
      await details.evaluate((element) => {
        element.scrollTop = 0
      })
      await expect(details.getByRole('progressbar')).toBeInViewport()
      await page.setViewportSize({ width: 320, height: 960 })
      expect(await details.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await page.screenshot({ path: info.outputPath(`context-${locale}-long-goal.png`) })
      await goals.execute('plan.clear', { sessionId })
      await expect(details.getByRole('listitem')).toHaveCount(0)
      await strip.getByRole('button', { name: goalLabels.clear, exact: true }).click()
      const confirm = status.getByRole('group', { name: goalLabels.clear, exact: true })
      await confirm.getByRole('button', { name: goalLabels.clear, exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect.poll(async () => (await goals.execute('goal.get', { sessionId })).goal).toBeNull()
      await expect(status).toHaveCount(0)
      await expect(page.getByRole('button', { name: copy.session.addMenu.open, exact: true })).toBeFocused()
      await expectComposerText(prompt, draft)
      expect(errors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        try {
          if (host) await stopWebSessionHost(host)
        } finally {
          await cleanupFixture(root)
        }
      }
    }
  })
}
