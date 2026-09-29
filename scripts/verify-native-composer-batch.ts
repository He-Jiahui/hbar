import { chromium, expect } from '@playwright/test'
import { HbarClient } from '@hbar/client'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { WEB_LANGUAGE_STORAGE_KEY } from '../apps/web/src/language'
import { expectComposerText } from '../e2e/support/composer-text'
import { cleanupNativeSessionFixture } from './native-fixture-cleanup'

const executable = resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/debug/hbar-desktop.exe')
if (!existsSync(executable)) throw new Error(`Build the desktop executable before native verification: ${executable}`)

const root = await mkdtemp(join(tmpdir(), 'hbar-native-session-'))
const output = resolve('artifacts/native-composer-batch')
const cdpPort = 9459
const child = Bun.spawn([executable], {
  env: {
    ...process.env,
    HBAR_HOME: root,
    HBAR_WORKSPACE: process.cwd(),
    HBAR_DEMO: '1',
    WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
  },
  stdin: 'ignore',
  stdout: 'ignore',
  stderr: 'pipe',
  windowsHide: true,
})
let hostPid: number | undefined
let api: HbarClient | undefined
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined

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

try {
  const connection = await until(async () =>
    z
      .object({ url: z.string().url(), token: z.string(), pid: z.number().int().positive() })
      .parse(JSON.parse(await readFile(join(root, 'settings/connection.json'), 'utf8'))),
  )
  hostPid = connection.pid
  api = new HbarClient(connection.url, connection.token)
  await api.connect()
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`))
  const page = await until(async () => {
    const active = browser!.contexts()[0]?.pages()[0]
    if (!active) throw new Error('The native WebView is not ready')
    return active
  })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await expect(page.locator('[data-hbar-app-ui-shell="app"]')).toBeVisible()
  await page.evaluate((key) => localStorage.setItem(key, 'en-US'), WEB_LANGUAGE_STORAGE_KEY)
  await page.reload()
  const copy = getShellCopy('en-US')
  await expect(page.locator('footer').getByText(copy.shell.connected, { exact: true })).toBeVisible()

  const newSession = page.getByRole('button', { name: copy.shell.newSession, exact: true })
  await newSession.click()
  const projectPicker = page.getByRole('dialog', { name: copy.shell.chooseWorkspace, exact: true })
  await expect(projectPicker).toBeVisible()
  const projects = projectPicker.locator('.hbar-app-react-workspace-picker-item')
  await expect(projects).toHaveCount(1)
  await projects.click()
  await expect(projectPicker).toBeHidden()
  const selectedRow = page.locator('[data-session-id][data-selected="true"]')
  await expect(selectedRow).toBeVisible()
  const firstId = await selectedRow.getAttribute('data-session-id')
  if (!firstId) throw new Error('The first native Session has no identity')
  await newSession.click()
  await expect.poll(() => selectedRow.getAttribute('data-session-id')).not.toBe(firstId)
  const secondId = await selectedRow.getAttribute('data-session-id')
  if (!secondId) throw new Error('The second native Session has no identity')

  const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
  await prompt.fill('Native draft')
  await page.getByRole('button', { name: copy.session.addMenu.open, exact: true }).click()
  const addMenu = page.getByRole('group', { name: copy.session.addMenu.menu, exact: true })
  await addMenu.getByRole('button', { name: copy.session.addMenu.slash, exact: true }).click()
  await expectComposerText(prompt, 'Native draft /')
  await expect(page.getByRole('listbox', { name: copy.session.slash.menu })).toBeVisible()
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: join(output, 'active-slash-1440.png') })
  await prompt.press('Escape')
  await expect(page.getByRole('listbox', { name: copy.session.slash.menu })).toBeHidden()
  await expectComposerText(prompt, 'Native draft /')

  await page.evaluate(async () => {
    function isBridge(value: unknown): value is { invoke(command: string, args: unknown): Promise<unknown> } {
      return !!value && typeof value === 'object' && 'invoke' in value && typeof value.invoke === 'function'
    }
    if (!('__TAURI_INTERNALS__' in window) || !isBridge(window.__TAURI_INTERNALS__))
      throw new Error('The Tauri window bridge is unavailable')
    await window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', {
      label: 'main',
      value: { Logical: { width: 900, height: 600 } },
    })
  })
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(900)
  const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await showSidebar.isVisible()) await showSidebar.click()
  const labels = copy.shell.archiveBatch
  const batchToggle = page.getByRole('button', { name: labels.enter, exact: true })
  await batchToggle.click()
  const firstTarget = page.locator(`[data-session-id="${firstId}"] .hbar-app-react-session-target`)
  const secondTarget = page.locator(`[data-session-id="${secondId}"] .hbar-app-react-session-target`)
  await firstTarget.click()
  await secondTarget.click()
  const selection = page.getByRole('region', { name: labels.selectionTitle, exact: true })
  await expect(selection).toContainText(labels.selectedCount(2, 100))
  await page.screenshot({ path: join(output, 'batch-selection-900.png') })
  await selection.getByRole('button', { name: labels.archiveSelected, exact: true }).click()
  const confirmation = page.getByRole('region', { name: labels.previewTitle(2), exact: true })
  await expect(confirmation.locator('li[data-session-id]')).toHaveCount(2)
  await page.screenshot({ path: join(output, 'batch-confirmation-900.png') })
  await confirmation.getByRole('button', { name: labels.cancel, exact: true }).click()
  await expect(selection).toContainText(labels.selectedCount(2, 100))
  for (const sessionId of [firstId, secondId])
    expect((await api.call('session.get', { sessionId }))?.archived).toBe(false)

  await selection.getByRole('button', { name: labels.archiveSelected, exact: true }).click()
  await confirmation.getByRole('button', { name: labels.confirm, exact: true }).click()
  await expect(confirmation.getByRole('status')).toHaveText(labels.succeeded(2))
  for (const sessionId of [firstId, secondId]) {
    expect((await api.call('session.get', { sessionId }))?.archived).toBe(true)
    expect((await api.call('session.snapshot', { sessionId })).runs).toHaveLength(0)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  expect(pageErrors).toEqual([])
  console.log('PASS: native WebView2 active Slash and confirmed batch archive at physical 1440/900 widths')
} finally {
  api?.disconnect()
  await browser?.close().catch(() => undefined)
  if (child.exitCode === null) child.kill()
  await child.exited
  if (hostPid) {
    try {
      process.kill(hostPid)
    } catch {
      // The disposable Host may already have stopped.
    }
  }
  await cleanupNativeSessionFixture(root)
}
