import { expect, test } from '@playwright/test'
import { createAgentCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-sidebar-parent-activity-'))
    throw new Error('Refusing unexpected parent-activity fixture cleanup')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

test('Project and Time sidebar keep an idle parent active while a child works and settle after cancellation', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-sidebar-parent-activity-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      goalAutoContinue: false,
    })
    const { sessionId, sessionTitle } = host.ready
    const copy = getShellCopy('zh-CN')
    const agents = createAgentCommandClient(host.client)
    const directory = createWorkspaceSessionCommandClient(host.client)
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    if (process.env.HBAR_ACTIVITY_EXPECTED_ASSET)
      await expect(page.locator('script[type="module"][src]')).toHaveAttribute(
        'src',
        new RegExp(process.env.HBAR_ACTIVITY_EXPECTED_ASSET),
      )
    await page.getByRole('button', { name: copy.shell.openSession(sessionTitle), exact: true }).click()
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const draft = '先查看后台工作，返回后继续保留这段输入。'
    await prompt.fill(draft)
    const groupedParent = page.locator(`.hbar-app-react-session-list [data-session-id="${sessionId}"]`)
    const groupedIndicator = groupedParent.locator('.hbar-app-react-session-activity-indicator')
    const timeView = page.locator('.hbar-app-react-sidebar-time-view')
    const runningGroup = timeView
      .getByRole('heading', { name: copy.shell.sort.time.groups.running, exact: true })
      .locator('..')
    const parent = timeView.locator(`[data-session-id="${sessionId}"]`)
    const indicator = parent.locator('.hbar-app-react-session-activity-indicator')
    const summary = async () =>
      (await directory.execute('session.activity.global.list', { limit: 60 })).items.find(
        (item) => item.session.id === sessionId,
      )?.execution
    const evidence = resolve('artifacts/sidebar-parent-activity/hbar-e2e')
    await mkdir(evidence, { recursive: true })

    const running = await agents.execute(
      'agent.create',
      {
        parentSessionId: sessionId,
        objective: '/slow',
        modelId: 'local-fixture',
        title: '后台 Agent · 正在核对导航入口与布局',
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(
        async () =>
          (await agents.execute('agent.result.get', { parentSessionId: sessionId, agentId: running.agentId })).status,
      )
      .toBe('running')
    await expect(groupedIndicator).toHaveAttribute('data-state', 'running')
    await expect(groupedIndicator).toHaveAttribute('aria-label', copy.shell.sort.time.execution.running)
    expect(await groupedParent.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    expect(
      await groupedParent.locator('.hbar-app-react-session-title').evaluate((node) => getComputedStyle(node).textAlign),
    ).toBe('start')
    await page.screenshot({ path: join(evidence, 'zh-project-child-working.png') })
    await page.getByTestId('sidebar-time-toggle').click()
    await expect(runningGroup.locator(`[data-session-id="${sessionId}"]`)).toBeVisible()
    await expect(indicator).toHaveAttribute('data-state', 'running')
    await expect(indicator).toHaveAttribute('aria-label', copy.shell.sort.time.execution.running)
    expect(await summary()).toEqual({ state: 'running', activeCount: 1, queuedCount: 0 })
    expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(0)
    const lamp = indicator.locator('.lumen-status-dot')
    await expect(lamp).toHaveAttribute('data-lumen-tone', 'info')
    await expect(lamp).toHaveAttribute('data-lumen-state', 'running')
    // The public motion preference may be off in the fixture; both modes must
    // preserve a visible blue lamp instead of reviving a private spin animation.
    expect(await lamp.evaluate((node) => getComputedStyle(node).animationName)).toBe(
      (await page.locator('[data-lumen-mode]').first().getAttribute('data-lumen-motion')) === 'off'
        ? 'none'
        : 'lumen-breathe',
    )
    expect(await parent.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: join(evidence, 'zh-child-working.png') })
    await agents.execute('agent.cancel', { parentSessionId: sessionId, agentId: running.agentId })
    await expect.poll(async () => (await summary())?.state).toBe('idle')
    await expect(indicator).toHaveCount(0)

    const objective = `/tool write_file ${JSON.stringify({ path: 'pending-background-write.txt', text: 'Do not write without approval.' })}`
    const waiting = await agents.execute(
      'agent.create',
      {
        parentSessionId: sessionId,
        objective,
        modelId: 'local-fixture',
        title: '后台 Agent · 等待确认后再修改临时工作区文件',
        approval: 'ask',
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(
        async () =>
          (await agents.execute('agent.result.get', { parentSessionId: sessionId, agentId: waiting.agentId })).status,
      )
      .toBe('waiting_approval')
    await expect(runningGroup.locator(`[data-session-id="${sessionId}"]`)).toBeVisible()
    await expect(indicator).toHaveAttribute('data-state', 'waiting_approval')
    await expect(indicator).toHaveAttribute('aria-label', copy.shell.sort.time.execution.waiting_approval)
    expect(await indicator.locator('svg').evaluate((node) => getComputedStyle(node).animationName)).toBe('none')
    await page.screenshot({ path: join(evidence, 'zh-child-waiting.png') })
    await page.getByTestId('sidebar-time-toggle').click()
    await expect(groupedIndicator).toHaveAttribute('data-state', 'waiting_approval')
    await expect(groupedIndicator).toHaveAttribute('aria-label', copy.shell.sort.time.execution.waiting_approval)
    await page.screenshot({ path: join(evidence, 'zh-project-child-waiting.png') })

    await page.getByRole('button', { name: copy.session.tools.activity, exact: true }).click()
    const pane = page.locator('.hbar-session-activity-workspace')
    const openChild = pane
      .locator(`[data-activity-agent-id="${waiting.agentId}"]`)
      .getByRole('button', { name: copy.activity.agents.open(objective), exact: true })
    await openChild.click()
    await page.getByRole('button', { name: copy.agents.returnToParent(sessionTitle), exact: true }).click()
    await expectComposerText(prompt, draft)
    await agents.execute('agent.cancel', { parentSessionId: sessionId, agentId: waiting.agentId })
    await expect.poll(async () => (await summary())?.activeCount).toBe(0)
    await pane.getByRole('button', { name: copy.activity.close, exact: true }).click()
    await expect(groupedIndicator).toHaveCount(0)
    await page.screenshot({ path: join(evidence, 'zh-project-child-settled.png') })
    await page.getByTestId('sidebar-time-toggle').click()
    await expect(indicator).toHaveCount(0)
    await expect(runningGroup).toHaveCount(0)
    await expect(
      timeView
        .getByRole('heading', { name: copy.shell.sort.time.groups.today, exact: true })
        .locator('..')
        .locator(`[data-session-id="${sessionId}"]`),
    ).toBeVisible()
    await expectComposerText(prompt, draft)
    await page.screenshot({ path: join(evidence, 'zh-child-settled.png') })
    expect(errors).toEqual([])
    await writeFile(
      join(evidence, 'manifest.json'),
      JSON.stringify(
        {
          asset: process.env.HBAR_ACTIVITY_EXPECTED_ASSET ?? null,
          reference: 'artifacts/parent-activity-reference-v10/manifest.json',
          groupedReference: 'artifacts/grouped-activity-reference-v11/manifest.json',
          boundary:
            'Temporary real Host and local-fixture Agents only; no paid providers or real profile. No pending write approved.',
          sessionId,
          ownRunCount: 0,
          runningAgentId: running.agentId,
          waitingAgentId: waiting.agentId,
          checks: [
            'idle parent hoisted before paging',
            'same state in grouped project row without changing navigation',
            'inline running indicator',
            'approval indicator is not animated',
            'Activity child open and return preserve draft',
            'cancellation removes parent from In progress',
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
