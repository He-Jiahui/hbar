import { chromium, expect, type Page } from '@playwright/test'
import { HbarClient, createConfigurationCommandClient, createSystemCommandClient } from '@hbar/client'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { WEB_LANGUAGE_STORAGE_KEY } from '../apps/web/src/language'
import { expectComposerText } from '../e2e/support/composer-text'
import {
  nativeSmokeFixtureRoot,
  ownsNativeSmokeHost,
  parseNativeSmokeConnection,
  waitForNativeSmokeExit,
} from './desktop-smoke-fixture'

const executable = resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/debug/hbar-desktop.exe')
if (!existsSync(executable)) throw new Error(`Build the desktop executable first: ${executable}`)

const root = await mkdtemp(join(tmpdir(), 'hbar-native-'))
const projectRoot = await mkdtemp(join(tmpdir(), 'hbar-native-'))
const output = resolve(process.env.HBAR_MODEL_PRESENTATION_OUTPUT ?? 'artifacts/native-model-presentation')
const portProbe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('fixture') })
const cdpPort = portProbe.port
await portProbe.stop(true)
await mkdir(join(root, 'settings'), { recursive: true })
await mkdir(output, { recursive: true })
await writeFile(join(root, 'settings/desktop-ui-zoom.json'), JSON.stringify({ version: 1, zoom: 1.5 }))

const child = Bun.spawn([executable], {
  env: {
    ...process.env,
    HBAR_HOME: root,
    HBAR_DATA_ROOT: root,
    HBAR_CACHE_ROOT: join(root, 'cache'),
    HBAR_WORKSPACE: projectRoot,
    HBAR_DEMO: '1',
    WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
  },
  stdin: 'ignore',
  stdout: 'ignore',
  stderr: 'ignore',
  windowsHide: true,
})
let connection: ReturnType<typeof parseNativeSmokeConnection> | undefined
let api: HbarClient | undefined
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
let inspectedPage: Page | undefined

async function until<T>(read: () => Promise<T>, timeout = 30_000): Promise<T> {
  const start = Date.now()
  while (true) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() - start >= timeout) throw error
      await Bun.sleep(100)
    }
  }
}

async function stopOwnedHost(metadata: ReturnType<typeof parseNativeSmokeConnection>): Promise<void> {
  const check = Bun.spawn(
    [
      'pwsh',
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${metadata.pid}').CommandLine`,
    ],
    { stdout: 'pipe', stderr: 'pipe', windowsHide: true },
  )
  const commandLine = await new Response(check.stdout).text()
  if ((await check.exited) !== 0) throw new Error('Could not verify the owned native model Host')
  if (!commandLine.trim()) return
  if (!ownsNativeSmokeHost(commandLine, root)) throw new Error('Refusing to stop an unowned Host')
  try {
    process.kill(metadata.pid)
  } catch {
    // The disposable Host may already have stopped.
  }
}

async function removeOwnedFixture(fixture: string): Promise<void> {
  const target = nativeSmokeFixtureRoot(fixture)
  for (let attempt = 0; ; attempt++) {
    try {
      await rm(target, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 40) throw error
      await Bun.sleep(250)
    }
  }
}

try {
  connection = await until(async () =>
    parseNativeSmokeConnection(JSON.parse(await readFile(join(root, 'settings/connection.json'), 'utf8'))),
  )
  api = new HbarClient(connection.url, connection.token)
  await api.connect()
  expect(resolve((await createSystemCommandClient(api).execute('system.paths.get', {})).dataRoot)).toBe(resolve(root))
  const workspace = (await api.call('system.bootstrap', {})).workspaces.find(
    (item) => resolve(item.path) === resolve(projectRoot),
  )
  if (!workspace) throw new Error('The native model fixture must use its owned project')
  const modelName =
    'Native model 原生完整名称 — Advanced reasoning, coding, review and multilingual development without truncation 2026 edition'
  await createConfigurationCommandClient(api).execute('provider.save', {
    provider: {
      id: 'native-model-fixture',
      name: 'Original native model provider — 原生模型供应商',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'native-model',
      models: [{ id: 'native-model', name: modelName }],
      thinkingLevels: ['off'],
    },
  })
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`))
  const webview = browser
  const page = await until(async () => {
    const active = webview.contexts()[0]?.pages()[0]
    if (!active) throw new Error('The native WebView is not ready')
    return active
  })
  inspectedPage = page
  const view = page
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('[data-hbar-app-ui-shell="app"]')).toBeVisible()
  await page.evaluate((key) => localStorage.setItem(key, 'en-US'), WEB_LANGUAGE_STORAGE_KEY)
  await page.reload()
  const copy = getShellCopy('en-US')
  await page.evaluate(async () => {
    function isBridge(value: unknown): value is { invoke(command: string, args: unknown): Promise<unknown> } {
      return !!value && typeof value === 'object' && 'invoke' in value && typeof value.invoke === 'function'
    }
    if (!('__TAURI_INTERNALS__' in window) || !isBridge(window.__TAURI_INTERNALS__))
      throw new Error('The Tauri bridge is unavailable')
    await window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', {
      label: 'main',
      value: { Logical: { width: 900, height: 600 } },
    })
  })
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(600)
  await expect.poll(() => page.evaluate(() => innerHeight)).toBe(400)
  expect(await page.locator('html').getAttribute('data-hbar-native-platform')).toBe('windows')

  const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await showSidebar.isVisible()) await showSidebar.click()
  const sidebar = page.getByRole('complementary', { name: copy.shell.projectsAndSessions, exact: true })
  await expect(sidebar.getByText(copy.shell.connected, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: copy.shell.newSession, exact: true }).click()
  const projectPicker = page.getByRole('dialog', { name: copy.shell.chooseWorkspace, exact: true })
  await expect(projectPicker).toBeVisible()
  const project = projectPicker.locator('.hbar-app-react-workspace-picker-item')
  await project.focus()
  await project.press('Enter')
  await expect(projectPicker).toBeHidden()
  const trigger = page.locator('.hbar-composer-model-trigger')
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
  await trigger.click()
  const menu = page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
  await expect(menu).toBeVisible()
  await expect(menu).toHaveAttribute('data-presentation', 'native')
  const width = await page.evaluate(() => innerWidth)
  const bounds = await menu.boundingBox()
  if (!bounds) throw new Error('The native model menu has no visible bounds')
  expect(bounds.x).toBeGreaterThan(0)
  expect(bounds.x + bounds.width).toBeLessThan(width)
  expect(bounds.width).toBeLessThan(width)
  const search = menu.getByRole('searchbox', { name: copy.session.modelPicker.search, exact: true })
  await expect(search).toBeFocused()
  await search.fill('native-model')
  const option = menu.getByRole('option').filter({ hasText: modelName })
  await expect(option).toHaveCount(1)
  const title = option.locator('.hbar-composer-model-name')
  await expect(title).toHaveText(modelName)
  const reading = await title.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const lines = [...range.getClientRects()].map((rect) => ({
      x: rect.x,
      right: rect.right,
      y: rect.y,
      bottom: rect.bottom,
    }))
    const style = getComputedStyle(element)
    return {
      lines,
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow,
      width: innerWidth,
      height: innerHeight,
    }
  })
  expect(new Set(reading.lines.map((line) => line.y)).size).toBeGreaterThan(1)
  expect(reading.whiteSpace).not.toBe('nowrap')
  expect(reading.textOverflow).not.toBe('ellipsis')
  for (const line of reading.lines) {
    expect(line.x).toBeGreaterThanOrEqual(0)
    expect(line.right).toBeLessThanOrEqual(reading.width + 1)
    expect(line.y).toBeGreaterThanOrEqual(0)
    expect(line.bottom).toBeLessThanOrEqual(reading.height + 1)
  }
  expect(errors).toEqual([])
  const capture = await page.context().newCDPSession(page)
  try {
    const snapshot: unknown = await capture.send('Page.captureScreenshot', { format: 'png', fromSurface: false })
    if (!snapshot || typeof snapshot !== 'object' || !('data' in snapshot) || typeof snapshot.data !== 'string')
      throw new Error('The native viewport capture has no PNG data')
    await writeFile(join(output, 'anchored-model-at-900-zoom-150.png'), Buffer.from(snapshot.data, 'base64'))
  } finally {
    await capture.detach()
  }
  await search.press('ArrowDown')
  await expect(option).toBeFocused()
  await option.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
  const prompt = view.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
  const draft = 'Original native draft — 原生模型选择不得发送'
  await prompt.fill(draft)
  await trigger.press('Enter')
  await expect(menu).toBeVisible()
  await menu.getByRole('button', { name: copy.session.modelPicker.close, exact: true }).click()
  await expect(menu).toBeHidden()
  await expectComposerText(prompt, draft)
  const sessions = (await api.call('session.list', { workspaceId: workspace.id, limit: 100 })).items
  expect(sessions).toHaveLength(1)
  const session = sessions[0]
  if (!session) throw new Error('The native fixture session disappeared')
  const snapshot = await api.call('session.snapshot', { sessionId: session.id })
  expect(snapshot.runs).toHaveLength(0)
  expect(errors).toEqual([])
  await writeFile(
    join(output, 'facts.json'),
    JSON.stringify(
      { width, bounds, modelName, reading, screenshotSource: 'native-view', runCount: 0, pageErrors: errors },
      null,
      2,
    ),
  )
  console.log(
    `PASS: native model name wraps completely in the anchored 900px / 150% menu (${width} CSS px), with keyboard and draft preserved; no Runs.`,
  )
} catch (error) {
  if (inspectedPage && !inspectedPage.isClosed())
    await inspectedPage.screenshot({ path: join(output, 'failure.png') }).catch(() => undefined)
  throw error
} finally {
  api?.disconnect()
  await browser?.close().catch(() => undefined)
  if (child.exitCode === null) child.kill()
  await waitForNativeSmokeExit(child.exited)
  if (connection) await stopOwnedHost(connection)
  for (const fixture of [root, projectRoot]) await removeOwnedFixture(fixture)
}
