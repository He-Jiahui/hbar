import { chromium } from '@playwright/test'
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { HbarClient } from '@hbar/client'

const root = await mkdtemp(join(tmpdir(), 'hbar-native-'))
const child = Bun.spawn(
  [resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/debug/hbar-desktop.exe')],
  {
    env: {
      ...process.env,
      HBAR_HOME: root,
      HBAR_WORKSPACE: process.cwd(),
      HBAR_DEMO: '1',
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9431',
    },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe',
    windowsHide: true,
  },
)
let hostPid: number | undefined
let api: HbarClient | undefined
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
async function until<T>(read: () => Promise<T>, limit = 30_000): Promise<T> {
  const start = Date.now()
  while (true) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() - start > limit) throw error
      await Bun.sleep(100)
    }
  }
}
try {
  const connection = await until(
    async () =>
      JSON.parse(await readFile(join(root, 'settings', 'connection.json'), 'utf8')) as {
        url: string
        token: string
        pid: number
      },
  )
  hostPid = connection.pid
  browser = await until(() => chromium.connectOverCDP('http://127.0.0.1:9431'))
  const page = await until(async () => {
    const page = browser!.contexts()[0]?.pages()[0]
    if (!page) throw new Error('WebView not created')
    return page
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text())
  })
  try {
    await page.locator('[data-hbar-app-ui-shell="app"]').waitFor({ timeout: 15_000 })
  } catch (error) {
    await page.screenshot({ path: 'artifacts/tauri-startup-failure.png' })
    console.error(`WebView URL: ${page.url()}\n${await page.locator('body').innerText()}\n${errors.join('\n')}`)
    console.error(
      await page.evaluate(async () => {
        const tauri = (
          window as unknown as {
            __TAURI_INTERNALS__?: { invoke(command: string): Promise<{ url: string; token: string }> }
          }
        ).__TAURI_INTERNALS__
        if (!tauri) return 'No Tauri initialization script'
        try {
          const result = await tauri.invoke('connection_info')
          return { url: result.url, hasToken: Boolean(result.token) }
        } catch (error) {
          return String(error)
        }
      }),
    )
    throw error
  }
  await page
    .locator('footer')
    .getByText(/^(已连接|Connected)$/)
    .waitFor({ timeout: 15_000 })
  await mkdir('artifacts/ui-redesign/tauri', { recursive: true })
  await page.getByRole('button', { name: /^(新建会话|New session)$/ }).click()
  const createDialog = page.getByRole('dialog', { name: /^(命令目录|Command catalog)$/ })
  const workspace = createDialog.getByRole('combobox', { name: /^(工作区 ID|Workspace ID)$/ })
  await until(async () => {
    const value = await workspace.inputValue()
    if (!value) throw new Error('Desktop session workspace options are still loading')
  })
  await createDialog.getByRole('textbox', { name: /^(标题|Title)$/ }).fill('Tauri visual session')
  await createDialog.getByRole('button', { name: /^(执行命令|Execute command)$/ }).click()
  await createDialog.waitFor({ state: 'hidden' })
  await page.getByRole('heading', { level: 1, name: 'Tauri visual session' }).waitFor()
  const fileChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^(添加附件|Add attachment)$/ }).click()
  await (
    await fileChooser
  ).setFiles({
    name: 'native-visual.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Selected through the native WebView file chooser.'),
  })
  await page.getByText('native-visual.txt', { exact: true }).waitFor()
  const noHorizontalOverflow = async () =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  if (!(await noHorizontalOverflow())) throw new Error('Desktop session has horizontal overflow')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/session-default-window.png' })
  await page.getByRole('button', { name: /^(文件|Files)$/ }).click()
  await page.getByRole('heading', { level: 2, name: /^(文件管理器|File manager)$/ }).waitFor()
  if (!(await noHorizontalOverflow())) throw new Error('Desktop tool window has horizontal overflow')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/files-default-window.png' })
  await page.getByRole('button', { name: /^(关闭文件管理器|Close file manager)$/ }).click()

  await page.evaluate(async () => {
    const tauri = (
      window as unknown as { __TAURI_INTERNALS__: { invoke(command: string, args: unknown): Promise<unknown> } }
    ).__TAURI_INTERNALS__
    await tauri.invoke('plugin:window|set_size', {
      label: 'main',
      value: { Logical: { width: 900, height: 600 } },
    })
  })
  await until(async () => {
    const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
    if (size.width < 880 || size.width > 920 || size.height < 580 || size.height > 620)
      throw new Error(`Desktop window has not resized: ${JSON.stringify(size)}`)
  })
  if (!(await noHorizontalOverflow())) throw new Error('Minimum desktop window has horizontal overflow')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/session-min-window.png' })
  await page.getByRole('button', { name: /^(文件|Files)$/ }).click()
  await page.getByRole('heading', { level: 2, name: /^(文件管理器|File manager)$/ }).waitFor()
  if (!(await noHorizontalOverflow())) throw new Error('Minimum desktop tool window has horizontal overflow')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/files-min-window.png' })
  await page.getByRole('button', { name: /^(关闭文件管理器|Close file manager)$/ }).click()
  api = new HbarClient(connection.url, connection.token)
  await api.connect()
  const data = await api.call('system.bootstrap', {})
  const session = await api.call('session.create', { workspaceId: data.workspaces[0]!.id })
  const run = await api.call('run.start', {
    sessionId: session.id,
    requestId: 'native-background',
    modelId: 'local-fixture',
    input: { text: '/slow' },
  })
  const hidden = await page.evaluate(async () => {
    const tauri = (
      window as unknown as { __TAURI_INTERNALS__: { invoke(command: string, args: unknown): Promise<unknown> } }
    ).__TAURI_INTERNALS__
    await tauri.invoke('plugin:window|close', { label: 'main' })
    return tauri.invoke('plugin:window|is_visible', { label: 'main' })
  })
  if (hidden !== false) throw new Error('Close did not hide the desktop window')
  child.kill()
  await child.exited
  const health = await fetch(`${connection.url}/healthz`)
  if (!health.ok) throw new Error('Host stopped with the desktop')
  await api.call('run.cancel', { runId: run.id })
  await until(async () => {
    if ((await api!.call('session.snapshot', { sessionId: session.id })).runs[0]?.status !== 'cancelled')
      throw new Error('Run has not settled')
  })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(
    'PASS: Native credentials connected; the WebView file chooser uploaded an attachment; session and file tool rendered at default and minimum window sizes; closing hides the window; Host survives desktop exit; independent SDK run cancellation works.',
  )
} catch (error) {
  console.error(await readFile(join(root, 'diagnostics', 'desktop-host.log'), 'utf8').catch(() => 'No host log'))
  throw error
} finally {
  api?.disconnect()
  await browser?.close().catch(() => {})
  if (child.exitCode === null) child.kill()
  await child.exited
  if (hostPid) {
    try {
      process.kill(hostPid)
    } catch {
      // The Host may already have exited with the desktop process.
    }
  }
  await Bun.sleep(200)
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
