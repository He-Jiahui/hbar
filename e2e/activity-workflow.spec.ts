import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient, createWorkflowCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectComposerText } from './support/composer-text'

async function cleanupFixture(root: string) {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-activity-workflow-'))
    throw new Error('Refusing cleanup outside the Workflow fixture')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}
test('Activity Workflow follows Host focus/delegation and opens the actual child without duplicating its Agent row', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-activity-workflow-'))
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
    const goals = createGoalPlanCommandClient(host.client),
      workflows = createWorkflowCommandClient(host.client)
    await goals.execute('goal.create', { sessionId, objective: '查看工作流核心进度，不启动付费模型' })
    const title = '核对工作流进度与委派 Agent 的详情入口，保持父会话输入草稿和返回路径'
    const plan = await goals.execute('plan.update', { sessionId, plan: [{ step: title, status: 'in_progress' }] })
    const input = {
      sessionId,
      stepIndex: 0,
      expectedPlanRevision: plan.revision,
      completionPolicy: 'user' as const,
      item: {
        id: 'activity-focus',
        title,
        scope: { readPaths: ['browser-e2e.md'], writePaths: ['browser-e2e.md'], tools: ['read_file', 'write_file'] },
        acceptanceChecks: [
          { id: 'review', description: '仅演示临时工作区的执行状态', verifier: { kind: 'user' as const } },
        ],
      },
    }
    await workflows.execute('workflow.focus.set', input)
    const copy = getShellCopy('zh-CN'),
      base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage(),
      errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    if (process.env.HBAR_ACTIVITY_EXPECTED_ASSET)
      await expect(page.locator('script[type="module"][src]')).toHaveAttribute(
        'src',
        new RegExp(process.env.HBAR_ACTIVITY_EXPECTED_ASSET),
      )
    await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true }),
      draft = '查看委派后返回时仍然保留这段输入。'
    await prompt.fill(draft)
    const activity = page.getByRole('button', { name: copy.session.tools.activity, exact: true })
    await activity.click()
    const pane = page.locator('.hbar-session-activity-workspace'),
      workflow = pane.locator('.hbar-activity-workflow')
    await expect(workflow.getByRole('heading', { name: copy.activity.workflow.title, exact: true })).toBeVisible()
    await expect(workflow.locator('[data-activity-focus-id="activity-focus"]')).toContainText(title)
    await expect(workflow.locator('[data-activity-focus-id="activity-focus"]').getByRole('button')).toHaveCount(0)
    const evidence = resolve('artifacts/activity-workflow/hbar-e2e')
    await mkdir(evidence, { recursive: true })
    await page.screenshot({ path: join(evidence, 'zh-workflow-focus.png') })
    const current = await workflows.execute('workflow.get', { sessionId })
    if (!current.workflow) throw new Error('No focused workflow')
    await workflows.execute('workflow.delegate', {
      sessionId,
      itemIds: ['activity-focus'],
      modelId: 'local-fixture',
      expectedRevision: current.workflow.revision,
    })
    let delegatedAgentId: string | null = null,
      delegationId: string | null = null
    await expect
      .poll(async () => {
        const snapshot = await workflows.execute('workflow.get', { sessionId })
        const delegation = snapshot.workflow?.delegations[0]
        delegatedAgentId = delegation?.agentId ?? null
        delegationId = delegation?.delegationId ?? null
        return Boolean(delegatedAgentId)
      })
      .toBe(true)
    if (!delegationId || !delegatedAgentId) throw new Error('No delegated Agent identity')
    const row = workflow.locator(`[data-activity-delegation-id="${delegationId}"]`)
    await expect(row.getByRole('button')).toHaveCount(1)
    await expect(row.getByRole('button')).toBeVisible()
    await expect(pane.locator(`[data-activity-agent-id="${delegatedAgentId}"]`)).toHaveCount(0)
    await page.screenshot({ path: join(evidence, 'zh-workflow-wide.png') })
    await page.setViewportSize({ width: 390, height: 800 })
    await expect(row.getByRole('button')).toBeInViewport()
    expect(await pane.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: join(evidence, 'zh-workflow-narrow.png') })
    await row.getByRole('button').focus()
    await row.getByRole('button').press('Enter')
    await expect(
      page.getByRole('button', { name: copy.agents.returnToParent(host.ready.sessionTitle), exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: copy.agents.returnToParent(host.ready.sessionTitle), exact: true }).click()
    await expect(pane).toBeVisible()
    await goals.execute('goal.clear', { sessionId })
    await expect(workflow).toContainText(copy.activity.workflow.status('cancelled'))
    await pane.getByRole('button', { name: copy.activity.close, exact: true }).click()
    await expectComposerText(prompt, draft)
    const sidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
    if (await sidebar.isVisible()) await sidebar.click()
    await page.getByRole('button', { name: copy.shell.openSession('Session 001'), exact: true }).click()
    await activity.click()
    await expect(pane.getByText(copy.activity.empty, { exact: true })).toBeVisible()
    await expect(workflow).toHaveCount(0)
    expect(errors).toEqual([])
    await writeFile(
      join(evidence, 'manifest.json'),
      JSON.stringify(
        {
          asset: process.env.HBAR_ACTIVITY_EXPECTED_ASSET ?? null,
          reference: 'artifacts/activity-workflow-reference/manifest.json',
          boundary:
            'Temporary real Host, public Workflow/Agent commands and isolated disposable Git workspace, local-fixture only; no paid provider or real profile.',
          checks: [
            'current focus is not a button',
            'new delegation in open pane without refresh',
            'one representation per Agent',
            'keyboard actual-child open and parent Back',
            'Goal clear cancels Workflow live',
            'parent draft preserved',
            'other Session has no foreign Workflow',
            'wide/narrow content flow',
          ],
          pageErrors: errors,
        },
        null,
        2,
      ),
    )
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupFixture(root)
  }
})
