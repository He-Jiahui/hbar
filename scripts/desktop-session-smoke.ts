import { chromium, expect } from '@playwright/test'
import { mkdtemp, mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { cleanupNativeSessionFixture } from './native-fixture-cleanup'
import {
  HbarClient,
  createBudgetCommandClient,
  createGoalPlanCommandClient,
  createRunCommandClient,
  createWorkflowCommandClient,
} from '@hbar/client'

const root = await mkdtemp(join(tmpdir(), 'hbar-native-session-'))
const executable = resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/debug/hbar-desktop.exe')
const child = Bun.spawn([executable], {
  env: {
    ...process.env,
    HBAR_HOME: root,
    HBAR_WORKSPACE: process.cwd(),
    HBAR_DEMO: '1',
    // Keep a running user desktop's WebView2 browser/profile out of the test.
    WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9433',
  },
  stdin: 'ignore',
  stdout: 'ignore',
  stderr: 'pipe',
  windowsHide: true,
})
let hostPid: number | undefined
let client: HbarClient | undefined
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
async function until<T>(read: () => Promise<T>): Promise<T> {
  const start = Date.now()
  while (true) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() - start >= 30000) throw error
      await Bun.sleep(100)
    }
  }
}
try {
  const connection = await until(async () =>
    z
      .object({ url: z.string().url(), token: z.string(), pid: z.number().int().positive() })
      .parse(JSON.parse(await readFile(join(root, 'settings/connection.json'), 'utf8'))),
  )
  hostPid = connection.pid
  client = new HbarClient(connection.url, connection.token)
  await client.connect()
  const api = client
  browser = await until(() => chromium.connectOverCDP('http://127.0.0.1:9433'))
  const webview = browser
  const page = await until(async () => {
    const page = webview.contexts()[0]?.pages()[0]
    if (!page) throw new Error('Native WebView is not ready')
    return page
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('[data-lumen-shell="app"]')).toBeVisible()
  await expect(page.locator('footer').getByText(/^(已连接|Connected)$/)).toBeVisible()
  const bootstrap = await api.call('system.bootstrap', {})
  const session = await api.call('session.create', {
    workspaceId: bootstrap.workspaces[0]!.id,
    title: 'Native session autonomy',
  })
  const goals = createGoalPlanCommandClient(api)
  const runs = createRunCommandClient(api)
  const publishPlan = async (step: string) => {
    await runs.execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'local-fixture',
        input: {
          text: `/tool update_plan ${JSON.stringify({ plan: [{ step, status: 'in_progress' }] })}`,
          images: [],
        },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(async () => (await goals.execute('plan.get', { sessionId: session.id }))?.plan[0]?.step)
      .toBe(step)
  }
  await publishPlan('Verify the desktop-loaded session implementation')
  const plan = await goals.execute('plan.get', { sessionId: session.id })
  if (!plan) throw new Error('Native fixture Plan was not persisted')
  await createWorkflowCommandClient(api).execute('workflow.focus.set', {
    sessionId: session.id,
    stepIndex: 0,
    item: { id: 'native-proof', title: 'Native catalog probe', scope: { tools: [] }, acceptanceChecks: [] },
    completionPolicy: 'agent',
    expectedPlanRevision: plan.revision,
  })
  const probe = await runs.execute(
    'run.submit',
    {
      sessionId: session.id,
      modelId: 'local-fixture',
      input: {
        text: `/tool workflow_execute ${JSON.stringify({
          calls: [
            { name: 'list_directory', arguments: { path: '.' }, continueOnScopeDenied: true },
            {
              name: 'workflow_expand_scope',
              arguments: {
                itemId: 'native-proof',
                scope: { readPaths: ['.'], writePaths: [], tools: ['list_directory'] },
                reason: 'Inspect the authorized native fixture workspace',
              },
            },
            { name: 'get_plan', arguments: {} },
          ],
        })}`,
        images: [],
      },
    },
    { idempotencyKey: crypto.randomUUID() },
  )
  await expect
    .poll(async () => (await runs.execute('operation.get', { operationId: probe.operationId })).status)
    .toBe('completed')
  const journalSchema = z.object({
    request: z.object({
      system: z.string(),
      systemContextOffset: z.number().int().nonnegative().optional(),
      toolNames: z.array(z.string()),
    }),
  })
  const requests = (await api.call('session.export', { sessionId: session.id }))
    .filter((event) => event.type === 'request.started')
    .map((event) => journalSchema.parse(event.data).request)
  const compactRequest = requests.find((request) => request.system.includes('<workflow_sequence_controls>'))
  expect(compactRequest?.system).toContain('get_plan({})')
  expect(compactRequest?.system).toContain('Scope-gated tools require explicit authorized scope expansion')
  expect(compactRequest?.system).toContain('<workflow_deferred_tools>')
  if (!compactRequest || compactRequest.systemContextOffset === undefined)
    throw new Error('Rebuilt Host context boundary not loaded')
  expect(compactRequest.system.slice(0, compactRequest.systemContextOffset)).not.toContain('<focus_workflow>')
  expect(compactRequest.system.slice(compactRequest.systemContextOffset)).toContain('<focus_workflow>')
  expect(compactRequest?.system).toContain(`Current Agent Plan revision: ${plan.revision}`)
  expect(compactRequest?.toolNames).toContain('workflow_execute')
  expect(compactRequest?.toolNames).not.toContain('get_plan')
  const probeSnapshot = await api.call('session.snapshot', { sessionId: session.id })
  expect(
    probeSnapshot.messages
      .flatMap((message) => message.content)
      .filter((block) => block.type === 'tool_result' && block.isError),
  ).toEqual([])
  const sequenceResult = probeSnapshot.messages
    .flatMap((message) => message.content)
    .find((block) => block.type === 'tool_result' && block.name === 'workflow_execute')
  if (sequenceResult?.type !== 'tool_result') throw new Error('Native scope recovery result is missing')
  const recovery = z
    .object({
      completed: z.literal(3),
      requested: z.literal(3),
      results: z.array(
        z.object({ name: z.string(), isError: z.boolean(), continuedScopeDenial: z.boolean().optional() }),
      ),
    })
    .parse(JSON.parse(sequenceResult.text))
  expect(recovery.results).toEqual([
    { name: 'list_directory', isError: true, continuedScopeDenial: true },
    { name: 'workflow_expand_scope', isError: false },
    { name: 'get_plan', isError: false },
  ])
  await createBudgetCommandClient(api).execute(
    'session.setBudget',
    { sessionId: session.id, tokens: 120000 },
    { idempotencyKey: 'native-budget' },
  )
  const created = await goals.execute('goal.create', {
    sessionId: session.id,
    objective: 'Verify actual desktop Goal state',
    tokenBudget: 200000,
  })
  await goals.execute('goal.set', { sessionId: session.id, status: 'paused' })
  await page
    .getByRole('button', { name: /Native session autonomy/ })
    .first()
    .click()
  await page.getByRole('button', { name: /^(目标与计划|Goals and plans)$/ }).click()
  const panel = page.locator('.hbar-app-react-goal-plan-workspace')
  const planSummary = panel.locator('.hbar-app-react-plan-summary')
  await expect(planSummary.getByText('Verify the desktop-loaded session implementation', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: /^(编辑计划|Edit plan|清除计划|Clear plan)$/ })).toHaveCount(0)
  await expect(panel.locator('.hbar-app-react-goal-execution')).toContainText('120,000')
  await panel.getByRole('button', { name: /^(编辑目标|Edit goal)$/ }).click()
  await panel.getByRole('combobox', { name: /^(目标状态|Goal status)$/ }).selectOption('complete')
  await panel.getByRole('button', { name: /^(保存目标|Save goal)$/ }).click()
  await expect(panel.getByRole('alert')).toBeVisible()
  expect((await goals.execute('goal.get', { sessionId: session.id })).goal?.status).toBe('paused')
  await panel.getByRole('button', { name: /^(返回目标与计划|Back to goals and plans)$/ }).click()
  await page.getByRole('button', { name: /^(关闭目标与计划|Close goals and plans)$/ }).click()
  await page.getByRole('button', { name: /^(目标与计划|Goals and plans)$/ }).click()
  await publishPlan('Desktop Plan live update')
  await expect(planSummary.getByText('Desktop Plan live update', { exact: true })).toBeVisible()
  await mkdir('artifacts/session-autonomy', { recursive: true })
  const geometry: unknown[] = []
  for (const size of [
    { width: 1440, height: 960 },
    { width: 900, height: 600 },
  ]) {
    await page.evaluate(async (size) => {
      function isBridge(value: unknown): value is { invoke(command: string, args: unknown): Promise<unknown> } {
        return !!value && typeof value === 'object' && 'invoke' in value && typeof value.invoke === 'function'
      }
      if (!('__TAURI_INTERNALS__' in window) || !isBridge(window.__TAURI_INTERNALS__))
        throw new Error('Native bridge missing')
      await window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: size } })
    }, size)
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(size.width)
    const layout = await page.evaluate(() => {
      const heading = document.querySelector('.hbar-app-react-goal-plan-workspace .lumen-tool-pane-heading h2')!
      const usage = document.querySelector('.lumen-inline-usage')!
      return {
        noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
        titleText: heading.textContent,
        titleWidth: heading.getBoundingClientRect().width,
        titleHeight: heading.getBoundingClientRect().height,
        titleLine: parseFloat(getComputedStyle(heading).lineHeight),
        usageHeight: usage.getBoundingClientRect().height,
      }
    })
    await page.screenshot({ path: `artifacts/session-autonomy/native-session-${size.width}.png` })
    console.log(JSON.stringify({ size, ...layout }))
    expect(layout.noOverflow).toBe(true)
    expect(layout.titleHeight).toBeLessThanOrEqual(layout.titleLine * 2 + 1)
    expect(layout.usageHeight).toBeLessThanOrEqual(160)
    geometry.push({ size, ...layout })
  }
  await goals.execute('goal.clear', { sessionId: session.id, expectedGoalId: created.goal!.goalId! })
  await expect(panel.getByText('Desktop Plan live update', { exact: true })).toHaveCount(0)
  expect((await goals.execute('goal.get', { sessionId: session.id })).goal).toBeNull()
  expect(await goals.execute('plan.get', { sessionId: session.id })).toBeNull()
  expect(errors).toEqual([])
  await Bun.write(
    'artifacts/session-autonomy/native-session-smoke.json',
    JSON.stringify(
      {
        executable,
        url: page.url(),
        geometry,
        nativeConnection: true,
        compactControlCatalogLoaded: true,
        scopeGatedCatalogLoaded: true,
        deferredCapabilityInventoryLoaded: true,
        hostContextBoundaryLoaded: true,
        freshPlanContextLoaded: true,
        boundedSequenceQuerySucceeded: true,
        boundedScopeRecoverySucceeded: true,
        dualBudgetVisible: true,
        planReadOnly: true,
        completionGuard: true,
        reopenedLivePlan: true,
        clearedLivePlan: true,
        errors,
      },
      null,
      2,
    ),
  )
  console.log(
    'PASS: rebuilt native WebView verifies compact control catalog, bounded scope-denial recovery, dual budgets, read-only/live Plan, guarded Goal completion, reopen/clear subscription, title/Usage flow at 1440 and 900.',
  )
} finally {
  client?.disconnect()
  await browser?.close().catch(() => {})
  if (child.exitCode === null) child.kill()
  await child.exited
  if (hostPid) {
    try {
      process.kill(hostPid)
    } catch {
      /* This isolated Host may already have stopped. */
    }
  }
  // WebView2 can release its profile after the native window process exits.
  await cleanupNativeSessionFixture(root)
}
