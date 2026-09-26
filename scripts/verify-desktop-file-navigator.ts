import { chromium, expect } from '@playwright/test'
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'

// Only an independent disposable native profile; never attach to the user's app.
const debugPort = 9439
const occupied = await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(1000) }).then(
  (response) => response.ok,
  () => false,
)
if (occupied) throw new Error('Native test port is occupied; do not attach to another app')
const root = await mkdtemp(join(tmpdir(), 'hbar-native-file-navigator-'))
// Host runtime data is intentionally protected from Files access.
// Keep the fixture workspace outside HBAR_HOME, as a user's workspace would be.
const workspacePath = await mkdtemp(join(tmpdir(), 'hbar-native-file-workspace-'))
const output = resolve('artifacts/file-navigator/native')
await mkdir(output, { recursive: true })
const first = 'first-native-file.md'
const second = 'second-native-file.md'
await writeFile(join(workspacePath, first), '# original first\n')
await writeFile(join(workspacePath, second), '# original second\n')
const child = Bun.spawn([resolve('apps/desktop/src-tauri/target/debug/hbar-desktop.exe')], {
  env: {
    ...process.env,
    HBAR_HOME: root,
    HBAR_WORKSPACE: workspacePath,
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
  const workspace = (await api.call('system.bootstrap', {})).workspaces.find(
    (item) => resolve(item.path) === resolve(workspacePath),
  )
  if (!workspace) throw new Error('Temporary native workspace is unavailable')
  const session = await createWorkspaceSessionCommandClient(api).execute(
    'session.create',
    { workspaceId: workspace.id, title: 'Native Files navigator check' },
    { idempotencyKey: crypto.randomUUID() },
  )
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`))
  const targetBrowser = browser
  const page = await until(async () => {
    const value = targetBrowser
      .contexts()[0]
      ?.pages()
      .find((item) => item.url().startsWith(connection.url))
    if (!value) throw new Error('Temporary native WebView is unavailable')
    return value
  })
  page.setDefaultTimeout(15_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('[data-hbar-app-ui-shell="app"]').waitFor()
  await page.reload()
  const locale = await page.evaluate(() => document.documentElement.lang)
  const copy = getShellCopy(locale === 'zh-CN' ? 'zh-CN' : 'en-US')
  await page.getByRole('button', { name: copy.shell.openSession(session.title), exact: true }).click()
  await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
  let files = page.locator('.hbar-app-react-file-workspace')
  await page.screenshot({ path: join(output, 'opened-dock.png') })
  await files.getByRole('button', { name: first, exact: true }).click()
  await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
  await files.getByRole('textbox', { name: first, exact: true }).fill('# retained native draft')
  await files.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
  files = page.locator('.hbar-app-react-file-workbench')
  const navigator = files.getByRole('region', { name: copy.files.navigator, exact: true })
  await expect(navigator).toBeVisible()
  await expect(navigator.getByRole('button', { name: first, exact: true })).toHaveAttribute('aria-current', 'page')
  await page.screenshot({ path: join(output, 'reader-and-navigator-1440.png') })
  for (const width of [1440, 900]) {
    await page.evaluate(async (width) => {
      const tauri = (
        window as unknown as { __TAURI_INTERNALS__: { invoke(command: string, args: unknown): Promise<unknown> } }
      ).__TAURI_INTERNALS__
      await tauri.invoke('plugin:window|set_size', {
        label: 'main',
        value: { Logical: { width, height: width === 1440 ? 960 : 600 } },
      })
    }, width)
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width)
    if (await files.getByRole('button', { name: copy.files.showNavigator, exact: true }).isVisible())
      await files.getByRole('button', { name: copy.files.showNavigator, exact: true }).click()
    await expect(navigator).toBeVisible()
    await navigator.getByRole('button', { name: second, exact: true }).click()
    await expect(files.getByLabel(copy.files.textPreview(second), { exact: true })).toContainText('# original second')
    if (await files.getByRole('button', { name: copy.files.showNavigator, exact: true }).isVisible())
      await files.getByRole('button', { name: copy.files.showNavigator, exact: true }).click()
    await navigator.getByRole('button', { name: first, exact: true }).click()
    await expect(files.getByLabel(copy.files.textPreview(first), { exact: true })).toContainText(
      '# retained native draft',
    )
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: join(output, `draft-return-${width}.png`) })
  }
  expect(await readFile(join(workspacePath, first), 'utf8')).toBe('# original first\n')
  if (process.env.HBAR_NATIVE_VERIFY_USAGE === '1') {
    const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
    if (await showSidebar.isVisible()) await showSidebar.click()
    await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
    const settings = page.locator('.hbar-app-react-settings-workspace')
    await settings.getByRole('button', { name: copy.settingsUsage.title, exact: true }).click()
    const usage = page.getByRole('region', { name: copy.settingsUsage.title, exact: true })
    await expect(usage.getByText(copy.settingsUsage.empty, { exact: true }).first()).toBeVisible()
    const last = copy.settingsUsage.windows.find((item) => item.id === '30d')
    if (!last) throw new Error('The 30-day usage choice is unavailable')
    await usage.getByRole('button', { name: last.label, exact: true }).click()
    await expect(usage.getByRole('button', { name: last.label, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(usage.getByRole('button', { name: copy.settingsUsage.refresh, exact: true })).toBeEnabled()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: resolve('artifacts/settings-usage/native-empty-900.png') })
    console.log(
      'PASS: Native Settings reads real Host-global empty usage in place, changes its window and has no horizontal overflow at 900×600.',
    )
  }
  expect(errors).toEqual([])
  console.log(
    'PASS: Independent native WebView uses current Host/Web resources; Files navigator selection and draft return work at 1440 and 900×600 without automatic disk writes or horizontal overflow.',
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
      /* Only the disposable test Host, already gone. */
    }
  }
  await Bun.sleep(200)
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  await rm(workspacePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
