import { chromium, expect, type Page } from '@playwright/test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { HbarClient, createSystemCommandClient } from '@hbar/client'
import { desktopChromeCopySchema, type DesktopChromeCopy } from '@hbar/contracts'
import { desktopChromeCopy } from '../apps/web/src/desktop-chrome-copy'
import { getShellCopy } from '../apps/web/src/shell-copy'
import {
  nativeSmokeFixtureRoot,
  ownsNativeSmokeHost,
  parseNativeSmokeConnection,
  waitForNativeSmokeExit,
} from './desktop-smoke-fixture'

const root = await mkdtemp(join(tmpdir(), 'hbar-native-'))
const project = await mkdtemp(join(tmpdir(), 'hbar-native-'))
const output = resolve('artifacts/desktop-elements/native-chrome/native')
let child: ReturnType<typeof Bun.spawn> | undefined
let connection: ReturnType<typeof parseNativeSmokeConnection> | undefined
let supervisorPid: number | undefined
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
async function osTitle(pid: number): Promise<string> {
  const inspector = Bun.spawn(
    [
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `[Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes([System.Diagnostics.Process]::GetProcessById(${pid}).MainWindowTitle)) | ConvertTo-Json -Compress`,
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore', windowsHide: true, timeout: 5_000 },
  )
  const output = await new Response(inspector.stdout).text()
  if ((await inspector.exited) !== 0) throw new Error('Unable to read the owned native window title')
  return Buffer.from(z.string().parse(JSON.parse(output)), 'base64').toString('utf16le')
}
async function invokeCopy(page: Page, copy: unknown): Promise<DesktopChromeCopy> {
  const result: unknown = await page.evaluate(async (copy) => {
    const bridge: unknown = Reflect.get(window, '__TAURI_INTERNALS__')
    if (typeof bridge !== 'object' || bridge === null) throw new Error('Missing native bridge')
    const invoke: unknown = Reflect.get(bridge, 'invoke')
    if (typeof invoke !== 'function') throw new Error('Missing native invoke')
    const value: unknown = Reflect.apply(invoke, bridge, ['set_desktop_chrome_copy', { copy }])
    const result: unknown = await value
    return result
  }, copy)
  return desktopChromeCopySchema.parse(result)
}
async function terminateOwnedHost(metadata: ReturnType<typeof parseNativeSmokeConnection>) {
  for (const pid of new Set([supervisorPid, metadata.pid].filter((value) => value !== undefined))) {
    const inspector = Bun.spawn(
      [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$chromeSmokeProcess = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($chromeSmokeProcess) { $chromeSmokeProcess.CommandLine | ConvertTo-Json -Compress }`,
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore', windowsHide: true, timeout: 5_000 },
    )
    const output = await new Response(inspector.stdout).text()
    if ((await inspector.exited) !== 0) throw new Error('Unable to check owned native Host')
    if (!output.trim()) continue
    const commandLine = z.string().parse(JSON.parse(output))
    if (!ownsNativeSmokeHost(commandLine, root)) throw new Error('Refusing to stop an unowned native Host')
    const stop = Bun.spawn(['taskkill.exe', '/PID', String(pid), '/T', '/F'], {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      windowsHide: true,
      timeout: 5_000,
    })
    if ((await stop.exited) !== 0) throw new Error('Unable to stop the exact owned native Host tree')
    await until(async () => {
      try {
        process.kill(pid, 0)
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return
        throw error
      }
      throw new Error('Owned native Host is still running')
    }, 5_000)
  }
}
const nativeStateSchema = z.object({
  failNext: z.boolean(),
  calls: z.array(z.object({ copy: z.unknown(), receipt: desktopChromeCopySchema.nullable(), failed: z.boolean() })),
})
try {
  await mkdir(output, { recursive: true })
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('owned fixture') })
  const debugPort = probe.port
  await probe.stop(true)
  if (!debugPort) throw new Error('Missing owned loopback debug port')
  child = Bun.spawn([resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/debug/hbar-desktop.exe')], {
    env: {
      ...process.env,
      HBAR_HOME: root,
      HBAR_DATA_ROOT: root,
      HBAR_CACHE_ROOT: join(root, 'cache'),
      HBAR_WORKSPACE: project,
      HBAR_DEMO: '1',
      WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview-profile'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
    },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    windowsHide: true,
  })
  connection = await until(async () => {
    const value: unknown = JSON.parse(await readFile(join(root, 'settings/connection.json'), 'utf8'))
    supervisorPid = z.object({ supervisorPid: z.number().int().positive().optional() }).parse(value).supervisorPid
    return parseNativeSmokeConnection(value)
  })
  api = new HbarClient(connection.url, connection.token)
  await api.connect()
  const paths = await createSystemCommandClient(api).execute('system.paths.get', {})
  expect(resolve(paths.dataRoot)).toBe(resolve(root))
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`))
  const webview = browser
  const page = await until(async () => {
    const candidate = webview.contexts()[0]?.pages()[0]
    if (!candidate) throw new Error('Owned native WebView not ready')
    return candidate
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('[data-lumen-shell="app"]')).toBeVisible()
  await expect(page.locator('footer').getByText(/^(已连接|Connected)$/)).toBeVisible()
  const current = await page.locator('html').getAttribute('lang')
  if (current !== 'en-US' && current !== 'zh-CN') throw new Error('Unexpected native startup locale')
  await page.getByRole('button', { name: getShellCopy(current).shell.settings, exact: true }).click()
  await page.getByRole('button', { name: getShellCopy(current).general.group, exact: true }).click()
  await page.evaluate(() => {
    const original = window.fetch
    const state: { failNext: boolean; calls: { copy: unknown; receipt: unknown; failed: boolean }[] } = {
      failNext: false,
      calls: [],
    }
    Reflect.set(window, '__hbarChromeSmoke', state)
    const intercept = async (request: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(request instanceof Request ? request.url : String(request), window.location.href)
      if (url.hostname !== 'ipc.localhost' || url.pathname !== '/set_desktop_chrome_copy')
        return await original.call(window, request, init)
      if (typeof init?.body !== 'string') throw new Error('Unexpected owned native copy envelope')
      const payload: unknown = JSON.parse(init.body)
      if (typeof payload !== 'object' || payload === null) throw new Error('Invalid owned native copy envelope')
      const copy: unknown = Reflect.get(payload, 'copy')
      const call: { copy: unknown; receipt: unknown; failed: boolean } = { copy, receipt: null, failed: false }
      state.calls.push(call)
      if (state.failNext) {
        state.failNext = false
        call.failed = true
        return new Response('Owned native bridge fault injection', {
          status: 200,
          headers: { 'Content-Type': 'text/plain', 'Tauri-Response': 'error' },
        })
      }
      const response = await original.call(window, request, init)
      call.failed = response.headers.get('Tauri-Response') !== 'ok'
      if (!call.failed) {
        const receipt: unknown = await response.clone().json()
        call.receipt = receipt
      }
      return response
    }
    // This callback runs in a DOM page; the test runner's Bun fetch also has a preconnect property.
    if (!Reflect.set(window, 'fetch', intercept)) throw new Error('Unable to observe the owned native copy IPC')
  })
  const state = async () =>
    nativeStateSchema.parse(
      await page.evaluate(() => {
        const value: unknown = Reflect.get(window, '__hbarChromeSmoke')
        return value
      }),
    )
  const alternate = current === 'en-US' ? 'zh-CN' : 'en-US'
  for (const locale of [alternate, current] as const) {
    const before = (await state()).calls.length
    const labels = getShellCopy(locale)
    await page.getByRole('radio', { name: labels.general.options[locale], exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect.poll(async () => (await state()).calls.length).toBe(before + 1)
    await expect.poll(async () => (await state()).calls.at(-1)?.receipt).toEqual(desktopChromeCopy(locale))
    expect(await osTitle(child.pid)).toBe(desktopChromeCopy(locale).windowTitle)
    await page.screenshot({ path: join(output, `native-${locale}.png`) })
  }
  await page.evaluate(() => {
    const state: unknown = Reflect.get(window, '__hbarChromeSmoke')
    if (typeof state !== 'object' || state === null) throw new Error('Missing owned copy observer')
    Reflect.set(state, 'failNext', true)
  })
  const failedLocale = alternate
  const failedCopy = getShellCopy(failedLocale)
  await page.getByRole('radio', { name: failedCopy.general.options[failedLocale], exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: failedCopy.general.desktopChrome.error })).toBeVisible()
  const failedCount = (await state()).calls.length
  await page.getByRole('button', { name: failedCopy.general.desktopChrome.retry, exact: true }).click()
  await expect.poll(async () => (await state()).calls.length).toBe(failedCount + 1)
  await expect.poll(async () => (await state()).calls.at(-1)?.receipt).toEqual(desktopChromeCopy(failedLocale))
  await expect(page.getByText(failedCopy.general.desktopChrome.error, { exact: true })).toHaveCount(0)
  const probeCopy = {
    ...desktopChromeCopy(failedLocale),
    windowTitle: '原生完整窗口标题 '.repeat(12).slice(0, 127),
    trayOpen: 'Open & original target',
  }
  expect(await invokeCopy(page, probeCopy)).toEqual(probeCopy)
  expect(await osTitle(child.pid)).toBe(probeCopy.windowTitle)
  for (const invalid of [
    { ...probeCopy, trayTooltip: '界'.repeat(128) },
    { ...probeCopy, trayTooltip: '🙂'.repeat(64) },
    { ...probeCopy, trayOpen: 'invalid\nmenu' },
    { ...probeCopy, extra: 'unowned' },
  ]) {
    await expect(invokeCopy(page, invalid)).rejects.toBeDefined()
    expect(await osTitle(child.pid)).toBe(probeCopy.windowTitle)
  }
  await invokeCopy(page, desktopChromeCopy(failedLocale))
  const bootstrap = await api.call('system.bootstrap', {})
  for (const session of bootstrap.sessions)
    expect((await api.call('session.snapshot', { sessionId: session.id })).runs).toHaveLength(0)
  expect(errors).toEqual([])
  await writeFile(
    join(output, 'facts.json'),
    JSON.stringify(
      {
        startupLocale: current,
        calls: (await state()).calls,
        windowTitle: await osTitle(child.pid),
        pageErrors: errors,
        sessionCount: bootstrap.sessions.length,
        runCount: 0,
      },
      null,
      2,
    ),
  )
  console.log(
    'PASS: actual native language replacement, failure recovery, native readback, UTF16 bounds and isolated resource release.',
  )
} finally {
  api?.disconnect()
  await browser?.close().catch(() => {})
  if (child) {
    if (child.exitCode === null) child.kill()
    await waitForNativeSmokeExit(child.exited)
  }
  const metadata =
    connection ??
    (await readFile(join(root, 'settings/connection.json'), 'utf8')
      .then((text) => parseNativeSmokeConnection(JSON.parse(text)))
      .catch(() => undefined))
  if (metadata) await terminateOwnedHost(metadata)
  await rm(nativeSmokeFixtureRoot(root), { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  await rm(nativeSmokeFixtureRoot(project), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
