import { chromium, expect, type Page } from '@playwright/test'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { WEB_LANGUAGE_STORAGE_KEY } from '../apps/web/src/language'
import { openSessionTool } from '../e2e/support/session-tools-menu'
import { nativeSmokeFixtureRoot, parseNativeSmokeConnection, waitForNativeSmokeExit } from './desktop-smoke-fixture'

interface ContinuityWindow extends Window {
  readonly __hbarResizeContinuity?: { readonly documentId: string; readonly editor: Element }
}

const project = resolve(import.meta.dir, '..')
const root = await mkdtemp(join(tmpdir(), 'hbar-native-'))
const workspace = await mkdtemp(join(tmpdir(), 'hbar-native-'))
const output = resolve(process.env.HBAR_CONTINUITY_OUTPUT ?? 'artifacts/desktop-resize-continuity/native')
await mkdir(output, { recursive: true })
const webRoot = resolve(process.env.HBAR_CONTINUITY_WEB_ROOT ?? 'dist/web')
if (!(await Bun.file(join(webRoot, 'index.html')).exists())) throw new Error('Build the frontend before native smoke')
const portProbe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('fixture') })
const debugPort = portProbe.port
await portProbe.stop(true)
const host = Bun.spawn(
  [
    process.execPath,
    'apps/host/src/main.ts',
    '--desktop',
    '--home',
    root,
    '--workspace',
    workspace,
    '--port',
    '0',
    '--demo',
  ],
  {
    cwd: project,
    env: {
      ...process.env,
      HBAR_STORAGE_WORKER: resolve(project, 'packages/storage/src/worker.ts'),
      HBAR_MAINTENANCE_WORKER: resolve(project, 'packages/storage/src/maintenance-worker.ts'),
      HBAR_WEB_ROOT: webRoot,
    },
    stdio: ['ignore', 'ignore', Bun.file(join(output, 'host-stderr.log'))],
    windowsHide: true,
  },
)
let desktop: Bun.Subprocess | undefined
let api: HbarClient | undefined
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
let page: Page | undefined
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
async function removeFixture(fixture: string): Promise<void> {
  const target = nativeSmokeFixtureRoot(fixture)
  for (let attempt = 0; ; attempt++) {
    try {
      await rm(target, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 30) throw error
      await Bun.sleep(250)
    }
  }
}
try {
  const connection = await until(async () =>
    parseNativeSmokeConnection(JSON.parse(await readFile(join(root, 'settings/connection.json'), 'utf8'))),
  )
  api = new HbarClient(connection.url, connection.token)
  await api.connect()
  const bootstrap = await api.call('system.bootstrap', {})
  const fixtureWorkspace = bootstrap.workspaces[0]
  if (!fixtureWorkspace) throw new Error('Owned fixture workspace is missing')
  const session = await createWorkspaceSessionCommandClient(api).execute(
    'session.create',
    { workspaceId: fixtureWorkspace.id, title: '窗口尺寸变化保留原会话与编辑器' },
    { idempotencyKey: crypto.randomUUID() },
  )
  const executable = resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/debug/hbar-desktop.exe')
  desktop = Bun.spawn([executable], {
    env: {
      ...process.env,
      HBAR_HOME: root,
      HBAR_DATA_ROOT: root,
      HBAR_CACHE_ROOT: join(root, 'cache'),
      HBAR_DESKTOP_DEV: '1',
      HBAR_WEB_DEV_URL: connection.url,
      WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview-profile'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  })
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, { timeout: 2_000 }))
  const ownedBrowser = browser
  page = await until(async () => {
    const current = ownedBrowser.contexts()[0]?.pages()[0]
    if (!current) throw new Error('Owned native WebView is missing')
    return current
  })
  const view = page
  await view.locator('[data-hbar-app-ui-shell="app"]').waitFor()
  await view.evaluate((key) => localStorage.setItem(key, 'zh-CN'), WEB_LANGUAGE_STORAGE_KEY)
  await view.reload()
  const copy = getShellCopy('zh-CN')
  const show = view.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
  await view.getByRole('treeitem', { name: session.title, exact: true }).click()
  await openSessionTool(view, copy.session.tools, 'monitoring')
  const rootFontPx = Number(process.env.HBAR_CONTINUITY_FONT_PX ?? '16')
  if (![16, 20].includes(rootFontPx)) throw new Error('Continuity smoke supports root fonts of 16 or 20 CSS pixels')
  await view.evaluate((fontPx) => {
    document.documentElement.style.fontSize = `${fontPx}px`
  }, rootFontPx)
  await view.waitForTimeout(250)
  const errors: string[] = []
  let navigations = 0
  view.on('pageerror', (error) => errors.push(error.message))
  view.on('framenavigated', (frame) => {
    if (frame === view.mainFrame()) navigations++
  })
  const composer = view.getByRole('textbox', { name: copy.session.prompt.input, exact: true, includeHidden: true })
  const draft = '窗口缩放不能重新加载这个编辑器 — keep the original editor'
  await composer.fill(draft)
  await composer.press('ArrowLeft')
  const documentId = crypto.randomUUID()
  const selection = await composer.evaluate(() => document.getSelection()?.anchorOffset)
  await composer.evaluate((editor, documentId) => {
    Object.defineProperty(window, '__hbarResizeContinuity', { value: { documentId, editor } })
  }, documentId)
  const records = []
  for (const width of [1440, 1360, 1280, 1200, 1050, 900, 1200, 1440]) {
    await view.evaluate(async (width) => {
      const bridge: unknown = Reflect.get(window, '__TAURI_INTERNALS__')
      if (!bridge || typeof bridge !== 'object') throw new Error('Native bridge is missing')
      const invoke: unknown = Reflect.get(bridge, 'invoke')
      if (typeof invoke !== 'function') throw new Error('Native invoke is missing')
      await Reflect.apply(invoke, bridge, [
        'plugin:window|set_size',
        {
          label: 'main',
          value: { Logical: { width, height: 900 } },
        },
      ])
    }, width)
    await expect.poll(async () => Math.abs((await view.evaluate(() => innerWidth)) - width)).toBeLessThanOrEqual(1)
    await view.waitForTimeout(250)
    const record = await composer.evaluate((editor) => {
      const probe = (window as ContinuityWindow).__hbarResizeContinuity
      return {
        width: innerWidth,
        documentId: probe?.documentId,
        sameEditor: probe?.editor === editor,
        focused: document.activeElement === editor,
        activeRole: document.activeElement?.getAttribute('role'),
        activeTag: document.activeElement?.tagName,
        editorVisible: editor.getClientRects().length > 0,
        editorUsable:
          !editor.closest('[inert]') &&
          editor.getClientRects().length > 0 &&
          getComputedStyle(editor).visibility !== 'hidden',
        text: editor.textContent,
        selection: document.getSelection()?.anchorOffset,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }
    })
    records.push(record)
  }
  await view.screenshot({ path: join(output, 'native-resize.png') })
  await writeFile(join(output, 'result.json'), JSON.stringify({ rootFontPx, navigations, errors, records }, null, 2))
  expect(navigations).toBe(0)
  expect(errors).toEqual([])
  for (const record of records) {
    expect(record.documentId).toBe(documentId)
    expect(record.sameEditor).toBe(true)
    if (record.editorUsable) {
      expect(record.focused).toBe(true)
      expect(record.selection).toBe(selection)
    }
    expect(record.text).toBe(draft)
    expect(record.overflow).toBe(false)
  }
  console.log('Native resize continuity passed: same document, editor and draft across 8 window changes')
} catch (error) {
  if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => undefined)
  throw error
} finally {
  if (browser) await browser.close()
  if (desktop) {
    desktop.kill()
    await waitForNativeSmokeExit(desktop.exited)
  }
  api?.disconnect()
  host.kill()
  await waitForNativeSmokeExit(host.exited)
  await removeFixture(root)
  await removeFixture(workspace)
}
