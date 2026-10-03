import { chromium, expect, type Page } from '@playwright/test'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { WEB_LANGUAGE_STORAGE_KEY } from '../apps/web/src/language'
import {
  nativeSmokeFixtureRoot,
  ownsNativeSmokeHost,
  parseNativeSmokeConnection,
  waitForNativeSmokeExit,
} from './desktop-smoke-fixture'

const root = await mkdtemp(join(tmpdir(), 'hbar-native-'))
const projectRoot = await mkdtemp(join(tmpdir(), 'hbar-native-'))
const output = resolve(process.env.HBAR_RESIZE_OUTPUT ?? 'artifacts/desktop-layout-resize')
await mkdir(output, { recursive: true })
const portProbe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('fixture') })
const debugPort = portProbe.port
await portProbe.stop(true)
const executable = resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/release/hbar-desktop.exe')
const child = Bun.spawn([executable], {
  env: {
    ...process.env,
    HBAR_HOME: root,
    HBAR_DATA_ROOT: root,
    HBAR_CACHE_ROOT: join(root, 'cache'),
    HBAR_WORKSPACE: projectRoot,
    HBAR_DEMO: '1',
    WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview-profile'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
  },
  stdin: 'ignore',
  stdout: 'ignore',
  stderr: 'ignore',
  windowsHide: true,
})
let connection: ReturnType<typeof parseNativeSmokeConnection> | undefined
let api: HbarClient | undefined
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
let page: Page | undefined
async function until<T>(read: () => Promise<T>): Promise<T> {
  const start = Date.now()
  while (true) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() - start > 30_000) throw error
      await Bun.sleep(150)
    }
  }
}
async function removeOwnedFixture(fixture: string): Promise<void> {
  const target = nativeSmokeFixtureRoot(fixture)
  for (let attempt = 0; attempt < 41; attempt++) {
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
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, { timeout: 2000 }))
  const webview = browser
  page = await until(async () => {
    const current = webview.contexts()[0]?.pages()[0]
    if (!current) throw new Error('Native page is missing')
    return current
  })
  const view = page
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('[data-hbar-app-ui-shell="app"]').waitFor()
  await page.evaluate((key) => localStorage.setItem(key, 'zh-CN'), WEB_LANGUAGE_STORAGE_KEY)
  await page.reload()
  const copy = getShellCopy('zh-CN')
  const workspace = (await api.call('system.bootstrap', {})).workspaces[0]
  if (!workspace) throw new Error('Native fixture workspace is missing')
  const commands = createWorkspaceSessionCommandClient(api)
  const session = await commands.execute(
    'session.create',
    { workspaceId: workspace.id, title: '原生拖动尺寸验收' },
    { idempotencyKey: crypto.randomUUID() },
  )
  const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
  await page.getByRole('button', { name: copy.shell.roster.refreshExpanded, exact: true }).click()
  await page.locator(`[data-session-id="${session.id}"] .hbar-app-react-session-target`).click()
  const invokeNative = (command: string, args: Record<string, unknown>) =>
    view.evaluate(
      async ({ command, args }) => {
        const bridge: unknown = Reflect.get(window, '__TAURI_INTERNALS__')
        if (!bridge || typeof bridge !== 'object') throw new Error('Native bridge is missing')
        const invoke: unknown = Reflect.get(bridge, 'invoke')
        if (typeof invoke !== 'function') throw new Error('Native invoke is missing')
        await Reflect.apply(invoke, bridge, [command, args])
      },
      { command, args },
    )
  const setWindowSize = (width: number, height: number) =>
    invokeNative('plugin:window|set_size', { label: 'main', value: { Logical: { width, height } } })
  await setWindowSize(1600, 1000)
  await expect.poll(() => view.evaluate(() => innerHeight)).toBe(1000)
  await page.getByRole('button', { name: '首次配置', exact: true }).click()
  await expect(page.locator('.hbar-desktop-layout-projection .flexlayout__splitter')).toHaveCount(2)
  const draft = '尺寸验收未发送草稿'
  const composer = view.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
  await composer.fill(draft)
  const readGeometry = () =>
    view.evaluate(() => {
      const layout = document.querySelector('.hbar-desktop-layout-projection .flexlayout__layout')
      if (!layout) throw new Error('Native layout is missing')
      const rect = (element: Element) => {
        const r = element.getBoundingClientRect()
        return { x: r.x, width: r.width, height: r.height }
      }
      let saved: { sidebar: number | null; tool: number | null } = { sidebar: null, tool: null }
      for (const key of Object.keys(localStorage).filter((key) => key.endsWith(':layout'))) {
        const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
        if (!raw || typeof raw !== 'object') continue
        const value: unknown = Reflect.get(raw, 'value')
        if (!value || typeof value !== 'object') continue
        const modules: unknown = Reflect.get(value, 'modules')
        if (!Array.isArray(modules)) continue
        const entries: readonly unknown[] = modules
        for (const module of entries) {
          if (!module || typeof module !== 'object') continue
          const id: unknown = Reflect.get(module, 'moduleId')
          const size: unknown = Reflect.get(module, 'size')
          const width: unknown = size && typeof size === 'object' ? Reflect.get(size, 'preferredRem') : undefined
          if (typeof width === 'number' && id === 'projects') saved = { ...saved, sidebar: width }
          if (typeof width === 'number' && id === 'session-tool') saved = { ...saved, tool: width }
        }
      }
      return {
        width: innerWidth,
        rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        layout: rect(layout),
        panes: [...layout.querySelectorAll('.flexlayout__tabset')].map(rect),
        splitters: [...layout.querySelectorAll('.flexlayout__splitter')].map(rect),
        saved,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }
    })
  const records: unknown[] = []
  const paneWidth = (geometry: Awaited<ReturnType<typeof readGeometry>>, index: number) => {
    const pane = geometry.panes[index]
    if (!pane) throw new Error(`Native pane ${index} is missing`)
    return pane.width
  }
  const dragAndVerify = async (index: 0 | 1, dx: number) => {
    const before = await readGeometry()
    const paneIndex = index === 0 ? 0 : 2
    const otherIndex = index === 0 ? 2 : 0
    const min = (index === 0 ? 12 : 20) * before.rem
    const max = (index === 0 ? 24 : 36) * before.rem
    const expectedWidth = Math.min(max, Math.max(min, paneWidth(before, paneIndex) + (index === 0 ? dx : -dx)))
    const splitter = view.locator('.hbar-desktop-layout-projection .flexlayout__splitter').nth(index)
    const r = await splitter.boundingBox()
    if (!r) throw new Error('Splitter missing')
    await view.mouse.move(r.x + r.width / 2, r.y + Math.min(r.height / 2, 300))
    await view.mouse.down()
    await view.mouse.move(r.x + r.width / 2 + dx, r.y + Math.min(r.height / 2, 300), { steps: 8 })
    const preview = await view.locator('.flexlayout__splitter_drag').boundingBox()
    if (!preview) throw new Error('Resize preview is missing')
    await view.mouse.up()
    await expect
      .poll(async () => Math.abs(paneWidth(await readGeometry(), paneIndex) - expectedWidth))
      .toBeLessThanOrEqual(1)
    await expect
      .poll(async () => {
        const measured = await readGeometry()
        const savedWidth = index === 0 ? measured.saved.sidebar : measured.saved.tool
        return savedWidth === null ? Number.POSITIVE_INFINITY : Math.abs(savedWidth * measured.rem - expectedWidth)
      })
      .toBeLessThanOrEqual(1)
    const after = await readGeometry()
    const finalSplitter = await splitter.boundingBox()
    if (!finalSplitter) throw new Error('Final splitter is missing')
    expect(Math.abs(finalSplitter.x - preview.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(paneWidth(after, otherIndex) - paneWidth(before, otherIndex))).toBeLessThanOrEqual(1)
    expect(index === 0 ? after.saved.tool : after.saved.sidebar).toBe(
      index === 0 ? (before.saved.tool ?? 24) : (before.saved.sidebar ?? 17),
    )
    expect(paneWidth(after, 1)).toBeGreaterThanOrEqual(20 * after.rem - 1)
    expect(after.overflow).toBe(false)
    records.push({ stage: 'drag', index, dx, expectedWidth, before, preview, after })
    console.log(`PASS: splitter ${index}; ${dx} CSS px gesture; final width ${paneWidth(after, paneIndex)} CSS px.`)
  }
  for (const scenario of [
    { id: 'native-100', width: 1600, zoom: 1, rem: 16 },
    { id: 'native-125', width: 2000, zoom: 1.25, rem: 16 },
    { id: 'font-20', width: 2000, zoom: 1, rem: 20 },
  ]) {
    await invokeNative('write_ui_zoom', { zoom: scenario.zoom })
    await invokeNative('plugin:webview|set_webview_zoom', { label: 'main', value: scenario.zoom })
    await setWindowSize(scenario.width, 1000)
    await view.evaluate((rem) => {
      document.documentElement.style.fontSize = `${rem}px`
    }, scenario.rem)
    await expect.poll(() => view.evaluate(() => innerWidth)).toBe(Math.round(scenario.width / scenario.zoom))
    await expect
      .poll(async () =>
        Math.abs(paneWidth(await readGeometry(), 0) - ((await readGeometry()).saved.sidebar ?? 17) * scenario.rem),
      )
      .toBeLessThanOrEqual(1)
    records.push({ stage: scenario.id, ...(await readGeometry()) })
    await dragAndVerify(1, -96)
    await dragAndVerify(0, 64)
    await dragAndVerify(1, -900)
    await dragAndVerify(0, 900)
    await dragAndVerify(1, 900)
    await dragAndVerify(0, -900)
    const beforeKeyboard = await readGeometry()
    await view.locator('.hbar-desktop-layout-projection .flexlayout__splitter').first().press('ArrowRight')
    await expect
      .poll(async () => Math.abs(paneWidth(await readGeometry(), 0) - paneWidth(beforeKeyboard, 0) - 10))
      .toBeLessThanOrEqual(1)
    await expect
      .poll(async () =>
        Math.abs(((await readGeometry()).saved.sidebar ?? 0) * scenario.rem - paneWidth(beforeKeyboard, 0) - 10),
      )
      .toBeLessThanOrEqual(1)
    await view.locator('.hbar-desktop-layout-projection .flexlayout__splitter').last().press('ArrowLeft')
    await expect
      .poll(async () => Math.abs(paneWidth(await readGeometry(), 2) - paneWidth(beforeKeyboard, 2) - 10))
      .toBeLessThanOrEqual(1)
    const beforeReload = await readGeometry()
    await expect
      .poll(async () => Math.abs(((await readGeometry()).saved.tool ?? 0) * scenario.rem - paneWidth(beforeReload, 2)))
      .toBeLessThanOrEqual(1)
    await composer.click()
    expect((await readGeometry()).saved).toEqual(beforeReload.saved)
    await view.screenshot({ path: join(output, `${scenario.id}.png`) })
    await view.reload()
    await view.locator('[data-hbar-app-ui-shell="app"]').waitFor()
    await view.evaluate((rem) => {
      document.documentElement.style.fontSize = `${rem}px`
    }, scenario.rem)
    await view.getByRole('button', { name: '首次配置', exact: true }).click()
    await expect(view.locator('.hbar-desktop-layout-projection .flexlayout__splitter')).toHaveCount(2)
    for (const index of [0, 1, 2])
      await expect
        .poll(async () => Math.abs(paneWidth(await readGeometry(), index) - paneWidth(beforeReload, index)))
        .toBeLessThanOrEqual(1)
    await expect(composer).toContainText(draft)
    records.push({ stage: `${scenario.id}-reload`, ...(await readGeometry()) })
    console.log(`PASS: ${scenario.id}; both splitters follow pointer, stop at bounds and restore within 1 CSS px.`)
  }
  await invokeNative('write_ui_zoom', { zoom: 1 })
  await invokeNative('plugin:webview|set_webview_zoom', { label: 'main', value: 1 })
  await setWindowSize(1600, 1000)
  await view.evaluate(() => {
    document.documentElement.style.fontSize = '16px'
  })
  await expect.poll(() => view.evaluate(() => innerWidth)).toBe(1600)
  await expect.poll(async () => (await readGeometry()).rem).toBe(16)
  const beforeCancel = await readGeometry()
  const cancelSplitter = view.locator('.hbar-desktop-layout-projection .flexlayout__splitter').first()
  const cancelBounds = await cancelSplitter.boundingBox()
  if (!cancelBounds) throw new Error('Cancel splitter is missing')
  await view.mouse.move(cancelBounds.x + cancelBounds.width / 2, cancelBounds.y + 250)
  await view.mouse.down()
  await view.mouse.move(cancelBounds.x + cancelBounds.width / 2 + 48, cancelBounds.y + 250, { steps: 5 })
  await expect(view.locator('.flexlayout__splitter_drag')).toBeVisible()
  await view.keyboard.press('Escape')
  await view.mouse.up()
  await expect(view.locator('.flexlayout__splitter_drag')).toHaveCount(0)
  expect((await readGeometry()).saved).toEqual(beforeCancel.saved)
  for (const index of [0, 1, 2])
    expect(Math.abs(paneWidth(await readGeometry(), index) - paneWidth(beforeCancel, index))).toBeLessThanOrEqual(1)
  await dragAndVerify(0, 900)
  await dragAndVerify(1, -900)
  const wide = await readGeometry()
  for (const width of [1200, 900, 1600]) {
    await setWindowSize(width, 800)
    await expect.poll(() => view.evaluate(() => innerWidth)).toBe(width)
    if (await show.isVisible()) await show.click()
    await expect(view.locator('.hbar-desktop-layout-projection .flexlayout__splitter')).toHaveCount(2)
    await expect.poll(async () => (await readGeometry()).layout.width).toBe(width - 2)
    await expect.poll(async () => paneWidth(await readGeometry(), 1)).toBeGreaterThanOrEqual(319)
    const geometry = await readGeometry()
    expect(geometry.saved).toEqual(wide.saved)
    expect(paneWidth(geometry, 0)).toBeGreaterThanOrEqual(191)
    expect(paneWidth(geometry, 2)).toBeGreaterThanOrEqual(319)
    expect(
      geometry.panes.reduce((sum, pane) => sum + pane.width, 0) +
        geometry.splitters.reduce((sum, splitter) => sum + splitter.width, 0),
    ).toBeLessThanOrEqual(geometry.layout.width + 1)
    expect(geometry.overflow).toBe(false)
    await expect(composer).toContainText(draft)
    if (width === 1600) {
      await expect.poll(async () => Math.abs(paneWidth(await readGeometry(), 0) - 384)).toBeLessThanOrEqual(1)
      await expect.poll(async () => Math.abs(paneWidth(await readGeometry(), 2) - 576)).toBeLessThanOrEqual(1)
    }
    records.push({ stage: `window-${width}`, ...(await readGeometry()) })
  }
  console.log(
    'PASS: Escape cancels without saving; window contraction preserves preferences and widening restores exact widths; draft retained.',
  )
  expect(errors).toEqual([])
  const snapshot = await api.call('session.snapshot', { sessionId: session.id })
  expect(snapshot.runs).toHaveLength(0)
  await writeFile(
    join(output, 'geometry.json'),
    JSON.stringify({ executable, records, pageErrors: errors, runCount: snapshot.runs.length }, null, 2),
  )
  console.log('PASS: native desktop resize; no model requests.')
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => undefined)
  throw error
} finally {
  api?.disconnect()
  await browser?.close().catch(() => undefined)
  if (child.exitCode === null) child.kill()
  await waitForNativeSmokeExit(child.exited)
  if (connection) {
    const check = Bun.spawn(
      [
        'pwsh',
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${connection.pid}').CommandLine`,
      ],
      { stdout: 'pipe', stderr: 'pipe', windowsHide: true },
    )
    const commandLine = await new Response(check.stdout).text()
    await check.exited
    if (ownsNativeSmokeHost(commandLine, root)) {
      try {
        process.kill(connection.pid)
      } catch {
        /* Fixture Host already exited. */
      }
    }
  }
  for (const fixture of [root, projectRoot]) await removeOwnedFixture(fixture)
}
