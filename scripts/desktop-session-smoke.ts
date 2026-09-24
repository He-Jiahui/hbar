import { chromium, expect } from '@playwright/test'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import {
  HbarClient,
  createBudgetCommandClient,
  createGoalPlanCommandClient,
  createRunCommandClient,
} from '@hbar/client'

const root = await mkdtemp(join(tmpdir(), 'hbar-native-session-'))
const executable = resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/debug/hbar-desktop.exe')
const child = Bun.spawn([executable], {
  env: {
    ...process.env,
    HBAR_HOME: root,
    HBAR_WORKSPACE: process.cwd(),
    HBAR_DEMO: '1',
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
  await expect(panel.getByText('Verify the desktop-loaded session implementation', { exact: true })).toBeVisible()
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
  await expect(panel.getByText('Desktop Plan live update', { exact: true })).toBeVisible()
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
        titleHeight: heading.getBoundingClientRect().height,
        titleLine: parseFloat(getComputedStyle(heading).lineHeight),
        usageHeight: usage.getBoundingClientRect().height,
      }
    })
    expect(layout.noOverflow).toBe(true)
    expect(layout.titleHeight).toBeLessThanOrEqual(layout.titleLine * 2 + 1)
    expect(layout.usageHeight).toBeLessThanOrEqual(160)
    geometry.push({ size, ...layout })
    await page.screenshot({ path: `artifacts/session-autonomy/native-session-${size.width}.png` })
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
    'PASS: rebuilt native WebView verifies dual budgets, read-only/live Plan, guarded Goal completion, reopen/clear subscription, title/Usage flow at 1440 and 900.',
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
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
