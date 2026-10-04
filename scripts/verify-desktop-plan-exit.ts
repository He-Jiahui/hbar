import { chromium, expect } from '@playwright/test'
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import {
  HbarClient,
  createConfigurationCommandClient,
  createRunCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'

// Independent disposable profile. Never attach to or terminate the user's app.
const debugPort = 9437
const occupied = await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(1000) }).then(
  (response) => response.ok,
  () => false,
)
if (occupied) throw new Error('The native test debugging port is already occupied; do not attach to another app')
const root = await mkdtemp(join(tmpdir(), 'hbar-native-plan-exit-'))
const output = resolve('artifacts/plan-exit/native')
await mkdir(output, { recursive: true })
const child = Bun.spawn([resolve('apps/desktop/src-tauri/target/debug/hbar-desktop.exe')], {
  env: {
    ...process.env,
    HBAR_HOME: root,
    HBAR_WORKSPACE: process.cwd(),
    HBAR_DEMO: '1',
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
    WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview-profile'),
  },
  stdin: 'ignore',
  stdout: 'ignore',
  stderr: 'pipe',
  windowsHide: true,
})
let hostPid: number | undefined
let api: HbarClient | undefined
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
async function until<T>(read: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 30_000
  while (true) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await Bun.sleep(100)
    }
  }
}
try {
  const connection = await until(async () =>
    z
      .object({ url: z.url(), token: z.string(), pid: z.number().int().positive() })
      .parse(JSON.parse(await readFile(join(root, 'settings', 'connection.json'), 'utf8'))),
  )
  hostPid = connection.pid
  api = new HbarClient(connection.url, connection.token)
  await api.connect()
  const bootstrap = await api.call('system.bootstrap', {})
  const workspace = bootstrap.workspaces[0]
  if (!workspace) throw new Error('Temporary native Host did not register its test workspace')
  const session = await createWorkspaceSessionCommandClient(api).execute(
    'session.create',
    { workspaceId: workspace.id, title: 'Native Plan approval check' },
    { idempotencyKey: crypto.randomUUID() },
  )
  await createConfigurationCommandClient(api).execute('mode.set', { sessionId: session.id, mode: 'plan' })
  const runs = createRunCommandClient(api)
  const run = await runs.execute(
    'run.submit',
    {
      sessionId: session.id,
      modelId: 'local-fixture',
      input: {
        text: `/tool exit_plan_mode ${JSON.stringify({ plan: '# Native Plan verification\n\n- Keep the original Run.\n- Preserve tool permissions.\n- Retain the document after approval.' })}`,
        images: [],
        approval: 'allow',
      },
    },
    { idempotencyKey: crypto.randomUUID() },
  )
  const targetApi = api
  const approval = await until(async () => {
    const pending = (await targetApi.call('session.snapshot', { sessionId: session.id })).approvals.find(
      (value) => value.tool === 'exit_plan_mode' && value.status === 'pending',
    )
    if (!pending) throw new Error('Native Plan request is not pending yet')
    return pending
  })
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`))
  const targetBrowser = browser
  const page = await until(async () => {
    const value = targetBrowser
      .contexts()[0]
      ?.pages()
      .find((candidate) => candidate.url().startsWith(connection.url))
    if (!value) throw new Error('Temporary WebView is unavailable')
    return value
  })
  page.setDefaultTimeout(15_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('[data-hbar-app-ui-shell="app"]').waitFor()
  await page.reload()
  const locale = await page.evaluate(() => document.documentElement.lang)
  const copy = getShellCopy(locale === 'zh-CN' ? 'zh-CN' : 'en-US')
  const current = await api.call('session.get', { sessionId: session.id })
  if (!current) throw new Error('Temporary native session is unavailable')
  await page.getByRole('button', { name: copy.shell.openSession(current.title), exact: true }).click()
  const card = page.locator(`[data-decision-id="${approval.id}"]`)
  await expect(card.getByRole('heading', { name: 'Native Plan verification' })).toBeVisible()
  await page.screenshot({ path: join(output, 'pending-1440.png') })
  await page.evaluate(async () => {
    const tauri = (
      window as unknown as { __TAURI_INTERNALS__: { invoke(command: string, args: unknown): Promise<unknown> } }
    ).__TAURI_INTERNALS__
    await tauri.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 900, height: 600 } } })
  })
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(900)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await card
    .getByRole('button', { name: copy.session.decisions.planExit.implement, exact: true })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(output, 'pending-900.png') })
  await card.getByRole('button', { name: copy.session.decisions.planExit.implement, exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(card.getByRole('status')).toHaveText(copy.session.decisions.planExit.implemented)
  await expect
    .poll(async () => (await runs.execute('operation.get', { operationId: run.operationId })).status)
    .toBe('completed')
  expect(await api.call('mode.get', { sessionId: session.id })).toEqual({ mode: 'default' })
  await page.reload()
  await expect(page.locator(`[data-decision-id="${approval.id}"]`).getByRole('status')).toHaveText(
    copy.session.decisions.planExit.implemented,
  )
  await page.locator(`[data-decision-id="${approval.id}"]`).scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(output, 'approved-restored-900.png') })
  expect(errors).toEqual([])
  console.log(
    'PASS: Independent native WebView loaded current Host/Web resources; Plan requires approval under allow, same Run settles, session exits Plan, and the approved document survives reload at 900×600 with no horizontal overflow.',
  )
} finally {
  api?.disconnect()
  await browser?.close().catch(() => {})
  if (child.exitCode === null) child.kill()
  await child.exited
  if (hostPid) {
    try {
      process.kill(hostPid)
    } catch {
      /* Only this test's Host, already gone. */
    }
  }
  await Bun.sleep(200)
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
