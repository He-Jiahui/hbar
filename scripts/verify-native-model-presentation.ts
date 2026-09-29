import { chromium, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { WEB_LANGUAGE_STORAGE_KEY } from '../apps/web/src/language'
import { cleanupNativeSessionFixture } from './native-fixture-cleanup'

const executable = resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/debug/hbar-desktop.exe')
if (!existsSync(executable)) throw new Error(`Build the desktop executable first: ${executable}`)

const root = await mkdtemp(join(tmpdir(), 'hbar-native-session-model-'))
const output = resolve('artifacts/native-model-presentation')
const cdpPort = 9467
await mkdir(join(root, 'settings'), { recursive: true })
await writeFile(join(root, 'settings/desktop-ui-zoom.json'), JSON.stringify({ version: 1, zoom: 1.5 }))

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
      .object({ pid: z.number().int().positive() })
      .parse(JSON.parse(await readFile(join(root, 'settings/connection.json'), 'utf8'))),
  )
  hostPid = connection.pid
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`))
  const page = await until(async () => {
    const active = browser!.contexts()[0]?.pages()[0]
    if (!active) throw new Error('The native WebView is not ready')
    return active
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('[data-hbar-app-ui-shell="app"]')).toBeVisible()
  await page.evaluate((key) => localStorage.setItem(key, 'en-US'), WEB_LANGUAGE_STORAGE_KEY)
  await page.reload()
  const copy = getShellCopy('en-US')
  await expect(page.locator('footer').getByText(copy.shell.connected, { exact: true })).toHaveCount(1)
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
  await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThanOrEqual(640)
  expect(await page.locator('html').getAttribute('data-hbar-native-platform')).toBe('windows')

  const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await showSidebar.isVisible()) await showSidebar.click()
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
  const menu = page.locator('.hbar-composer-picker-popover[data-kind="model"]')
  await expect(menu).toBeVisible()
  await expect(menu).toHaveAttribute('data-presentation', 'native')
  const width = await page.evaluate(() => innerWidth)
  const bounds = await menu.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThan(0)
  expect(bounds!.x + bounds!.width).toBeLessThan(width)
  expect(bounds!.width).toBeLessThan(width)
  expect(errors).toEqual([])
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: join(output, 'anchored-model-at-900-zoom-150.png') })
  console.log(`PASS: native model picker stays anchored at 900px, 150% zoom (CSS viewport ${width}px)`)
} finally {
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
