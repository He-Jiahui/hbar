import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectComposerText } from './support/composer-text'

async function cleanupFixture(root: string) {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-activity-tasks-'))
    throw new Error('Refusing cleanup outside owned task fixture')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

test('Activity tasks follow real Plan updates, clear and Session selection without changing the draft', async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-activity-tasks-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      sessionCount: 2,
      goalAutoContinue: false,
    })
    const { sessionId } = host.ready
    const goals = createGoalPlanCommandClient(host.client)
    const longStep = '将实时任务进度放到同一 Activity 面板中，让长文本与状态自然排列而不遮挡操作'
    const steps = [
      { step: '理解目标与现有入口', status: 'completed' as const },
      {
        step: longStep,
        status: 'in_progress' as const,
      },
      { step: '验证核心操作流程', status: 'pending' as const },
    ]
    await goals.execute('plan.update', { sessionId, plan: steps })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    if (process.env.HBAR_ACTIVITY_EXPECTED_ASSET)
      await expect(page.locator('script[type="module"][src]')).toHaveAttribute(
        'src',
        new RegExp(process.env.HBAR_ACTIVITY_EXPECTED_ASSET),
      )
    const copy = getShellCopy('zh-CN')
    await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const draft = '保留这段未发送输入；查看任务不是发送或编辑计划。'
    await prompt.fill(draft)
    const activity = page.getByRole('button', { name: copy.session.tools.activity, exact: true })
    await activity.click()
    const pane = page.locator('.hbar-session-activity-workspace')
    const tasks = pane.locator('.hbar-activity-tasks')
    await expect(tasks.getByRole('listitem')).toHaveCount(3)
    await expect(tasks.getByRole('progressbar')).toHaveAttribute('value', '1')
    await expect(tasks.getByRole('progressbar')).toHaveAccessibleName(copy.activity.tasks.progress(1, 3))
    await expect(tasks.locator('[data-activity-task-status="in_progress"]')).toContainText(longStep)
    const evidence = resolve('artifacts/activity-tasks/hbar-e2e')
    await mkdir(evidence, { recursive: true })
    await page.screenshot({ path: join(evidence, 'zh-tasks-wide.png') })
    await goals.execute('plan.update', {
      sessionId,
      plan: steps.map((step) => ({ ...step, status: 'completed' as const })),
    })
    await expect(tasks.locator('[data-activity-task-status="completed"]')).toHaveCount(3)
    await expect(tasks.getByRole('progressbar')).toHaveAttribute('value', '3')
    await page.setViewportSize({ width: 390, height: 800 })
    await expect(tasks.getByRole('progressbar')).toBeInViewport()
    expect(await tasks.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: join(evidence, 'zh-tasks-narrow.png') })
    await goals.execute('plan.update', {
      sessionId,
      plan: Array.from({ length: 100 }, (_, index) => ({
        step: `容量边界任务 ${index + 1}`,
        status: 'pending' as const,
      })),
    })
    await expect(tasks.getByRole('listitem')).toHaveCount(100)
    expect(
      await pane.locator('.hbar-session-activity-body').evaluate((node) => node.scrollHeight > node.clientHeight),
    ).toBe(true)
    await tasks.getByRole('listitem').last().scrollIntoViewIfNeeded()
    await expect(tasks.getByRole('listitem').last()).toBeInViewport()
    await goals.execute('plan.clear', { sessionId })
    await expect(tasks).toHaveCount(0)
    await goals.execute('plan.update', { sessionId, plan: steps })
    await expect(tasks.getByRole('listitem')).toHaveCount(3)
    await pane.getByRole('button', { name: copy.activity.close, exact: true }).click()
    await expectComposerText(prompt, draft)
    const sidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
    if (await sidebar.isVisible()) await sidebar.click()
    await page.getByRole('button', { name: copy.shell.openSession('Session 001'), exact: true }).click()
    await activity.click()
    await expect(pane.getByText(copy.activity.empty, { exact: true })).toBeVisible()
    await expect(tasks).toHaveCount(0)
    expect(errors).toEqual([])
    await writeFile(
      join(evidence, 'manifest.json'),
      JSON.stringify(
        {
          asset: process.env.HBAR_ACTIVITY_EXPECTED_ASSET ?? null,
          original: 'artifacts/activity-tasks-reference/manifest.json',
          boundary:
            'Temporary real Host, Plan public commands, synthetic Sessions. No model run, paid provider or real profile.',
          checks: [
            'live Plan update without refresh',
            '100-step pane scroll',
            'clear tombstone',
            'other Session has no foreign task',
            'draft unchanged',
            'wide/narrow natural flow',
          ],
          pageErrors: errors,
        },
        null,
        2,
      ),
    )
    await page.screenshot({ path: testInfo.outputPath('activity-other-session.png') })
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupFixture(root)
  }
})
