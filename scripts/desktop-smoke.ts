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
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
  await page.getByRole('button', { name: /^(外观|Appearance)$/ }).click()
  const controlSize = page.getByRole('combobox', { name: /^(控件尺寸|Control size)$/ })
  const textSize = page.getByRole('combobox', { name: /^(文本尺寸|Text size)$/ })
  const cornerSize = page.getByRole('combobox', { name: /^(圆角尺寸|Corner size)$/ })
  await controlSize.selectOption('l')
  await textSize.selectOption('l')
  await cornerSize.selectOption('l')
  await page.getByRole('button', { name: /^(保存外观|Save appearance)$/ }).click()
  await page.getByText(/^(外观偏好已保存|Appearance preferences saved)$/).waitFor()
  const largeAppearance = await page.evaluate(() => {
    const control = document.querySelector<HTMLElement>('#hbar-appearance-controlSize')
    if (!control) throw new Error('Desktop appearance control is missing')
    return {
      controlSize: document.documentElement.dataset.hbarAppUiControlSize,
      textSize: document.documentElement.dataset.hbarAppUiTextSize,
      cornerSize: document.documentElement.dataset.hbarAppUiCornerSize,
      height: Math.round(control.getBoundingClientRect().height),
    }
  })
  if (
    largeAppearance.controlSize !== 'l' ||
    largeAppearance.textSize !== 'l' ||
    largeAppearance.cornerSize !== 'l' ||
    largeAppearance.height !== 44
  )
    throw new Error(`Desktop appearance did not apply the large scale: ${JSON.stringify(largeAppearance)}`)
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/appearance-large-default-window.png' })
  await page.reload()
  await page
    .locator('footer')
    .getByText(/^(已连接|Connected)$/)
    .waitFor({ timeout: 15_000 })
  await page.locator('html[data-hbar-app-ui-control-size="l"]').waitFor()
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
  await page.getByRole('button', { name: /^(外观|Appearance)$/ }).click()
  await page.getByRole('combobox', { name: /^(控件尺寸|Control size)$/ }).waitFor()
  if (
    (await page.getByRole('combobox', { name: /^(控件尺寸|Control size)$/ }).inputValue()) !== 'l' ||
    (await page.getByRole('combobox', { name: /^(文本尺寸|Text size)$/ }).inputValue()) !== 'l' ||
    (await page.getByRole('combobox', { name: /^(圆角尺寸|Corner size)$/ }).inputValue()) !== 'l'
  )
    throw new Error('Desktop appearance preferences did not survive reload')
  await page.getByRole('button', { name: /^(恢复默认|Restore defaults)$/ }).click()
  await page.getByText(/^(外观偏好已保存|Appearance preferences saved)$/).waitFor()
  await page.locator('html[data-hbar-app-ui-control-size="m"]').waitFor()
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/appearance-reset-default-window.png' })
  await page.getByRole('button', { name: /^(返回会话|Back to session)$/ }).click()
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
  const readSessionGeometry = async () =>
    page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element) throw new Error(`Missing desktop layout region: ${selector}`)
        const bounds = element.getBoundingClientRect()
        return { left: bounds.left, right: bounds.right, width: bounds.width }
      }
      return {
        shell: rect('.hbar-app-ui-app-shell'),
        frame: rect('.hbar-app-ui-app-frame'),
        sessionMain: rect('.hbar-app-react-session-main'),
        conversation: rect('.hbar-app-ui-conversation'),
        timeline: rect('.hbar-app-ui-conversation-content'),
        composer: rect('.hbar-app-react-session-footer'),
      }
    })
  const assertSessionGeometry = async (stage: string) => {
    const geometry = await readSessionGeometry()
    const within = (left: number, right: number, tolerance = 1) => Math.abs(left - right) <= tolerance
    if (
      !within(geometry.sessionMain.left, geometry.conversation.left) ||
      !within(geometry.sessionMain.right, geometry.conversation.right)
    )
      throw new Error(`${stage}: conversation does not fill the session main region: ${JSON.stringify(geometry)}`)
    if (
      !within(geometry.timeline.left, geometry.composer.left) ||
      !within(geometry.timeline.right, geometry.composer.right)
    )
      throw new Error(`${stage}: timeline and composer edges differ: ${JSON.stringify(geometry)}`)
    const leftGutter = geometry.timeline.left - geometry.conversation.left
    const rightGutter = geometry.conversation.right - geometry.timeline.right
    if (!within(leftGutter, rightGutter) || geometry.composer.width < Math.min(geometry.conversation.width, 800))
      throw new Error(
        `${stage}: session content is not balanced across the available width: ${JSON.stringify(geometry)}`,
      )
    return geometry
  }
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
  const collapsedGeometry = await assertSessionGeometry('Minimum desktop window')
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/session-min-window.png' })
  await page.getByRole('button', { name: /^(显示工程与会话侧栏|Show projects and sessions sidebar)$/ }).click()
  await page.getByRole('complementary', { name: /^(工程与会话|Projects and sessions)$/ }).waitFor()
  const expandedGeometry = await assertSessionGeometry('Minimum desktop window with sidebar')
  const sidebarGeometry = await page.locator('.hbar-app-ui-app-sidebar-drawer').evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return { left: bounds.left, right: bounds.right, width: bounds.width, position: getComputedStyle(element).position }
  })
  if (
    sidebarGeometry.position === 'fixed' ||
    Math.abs(sidebarGeometry.right - expandedGeometry.frame.left) > 1 ||
    expandedGeometry.frame.width >= collapsedGeometry.frame.width
  )
    throw new Error(
      `Minimum desktop sidebar did not shrink the workspace in normal flow: ${JSON.stringify({ sidebarGeometry, collapsedGeometry, expandedGeometry })}`,
    )
  await page.screenshot({ path: 'artifacts/ui-redesign/tauri/session-sidebar-min-window.png' })
  await page.getByRole('button', { name: /^(隐藏工程与会话侧栏|Hide projects and sessions sidebar)$/ }).click()
  await page.getByRole('button', { name: /^(显示工程与会话侧栏|Show projects and sessions sidebar)$/ }).waitFor()
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
    'PASS: Native credentials connected; appearance preferences applied, survived reload, and reset through the real WebView; the WebView file chooser uploaded an attachment; session content aligned at both edges; the medium-width sidebar shrank the main workspace without overlap; session and file tool rendered at default and minimum window sizes; closing hides the window; Host survives desktop exit; independent SDK run cancellation works.',
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
