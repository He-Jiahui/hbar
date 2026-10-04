import { chromium, expect, type Page } from '@playwright/test'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'
import {
  HbarClient,
  createBudgetCommandClient,
  createModelCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { sessionImageCopy } from '../apps/web/src/session-image-copy'
import { expectComposerText } from '../e2e/support/composer-text'
import { imageFile } from '../e2e/support/image-file'
import { cleanupNativeSessionFixture } from './native-fixture-cleanup'

// Runs only the caller's existing launcher and fresh Host/Web resources. It never builds or attaches to a user app.
const DEBUG_PORT = 9443
const PROTECTED_PIDS = new Set([9572, 48668])
const processSchema = z.object({
  pid: z.number().int().positive(),
  parentPid: z.number().int().nonnegative(),
  executable: z.string().min(1),
  commandLine: z.string().min(1),
  argv: z.array(z.string()).min(1).max(32),
  createdAt: z.string().min(1),
})
type ProcessIdentity = z.output<typeof processSchema>

async function until<Value>(read: () => Promise<Value>, timeoutMs = 30_000): Promise<Value> {
  const deadline = Date.now() + timeoutMs
  while (true) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await Bun.sleep(100)
    }
  }
}

async function queryProcess(pid: number): Promise<ProcessIdentity | null> {
  if (!Number.isSafeInteger(pid) || pid < 1 || PROTECTED_PIDS.has(pid))
    throw new Error('Refusing an invalid or previously blocked process identity')
  // A captured numeric PID is the only interpolation; Windows decodes its argv without substring ownership guesses.
  const command = `$fixtureProcess = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($null -eq $fixtureProcess) { 'null' } else {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HbarOwnershipFixtureArguments {
  [DllImport("shell32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern IntPtr CommandLineToArgvW(string commandLine, out int count);
  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr pointer);
  public static string[] Parse(string line) {
    int count;
    IntPtr pointer = CommandLineToArgvW(line, out count);
    if (pointer == IntPtr.Zero) throw new InvalidOperationException("Unable to decode fixture arguments");
    try {
      if (count < 1 || count > 32) throw new InvalidOperationException("Unbounded fixture arguments");
      string[] result = new string[count];
      for (int index = 0; index < count; index++)
        result[index] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(pointer, index * IntPtr.Size));
      return result;
    } finally { LocalFree(pointer); }
  }
}
'@
[ordered]@{ pid = [int]$fixtureProcess.ProcessId; parentPid = [int]$fixtureProcess.ParentProcessId; executable = $fixtureProcess.ExecutablePath; commandLine = $fixtureProcess.CommandLine; argv = @([HbarOwnershipFixtureArguments]::Parse($fixtureProcess.CommandLine)); createdAt = $fixtureProcess.CreationDate.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress
}`
  const child = Bun.spawn(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
    timeout: 10_000,
  })
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exit !== 0) throw new Error(`Fixture ownership query failed: ${stderr.trim()}`)
  return processSchema.nullable().parse(JSON.parse(stdout.trim()) as unknown)
}

const samePath = (actual: string | undefined, expected: string) =>
  actual !== undefined && isAbsolute(actual) && resolve(actual).toLowerCase() === resolve(expected).toLowerCase()

async function cleanupWorkspace(workspacePath: string): Promise<void> {
  const target = resolve(workspacePath)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-native-images-workspace-'))
    throw new Error('Refusing cleanup outside this exact temporary workspace')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

async function awaitNativeExit(exited: Promise<number>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      exited,
      new Promise<never>((_accept, reject) => {
        timer = setTimeout(() => reject(new Error('Owned desktop did not exit within the cleanup deadline')), 10_000)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function showSidebar(page: Page, locale: ShellLocale): Promise<void> {
  const trigger = page.getByRole('button', { name: getShellCopy(locale).shell.showSidebar, exact: true })
  if (await trigger.isVisible()) await trigger.click()
}

async function changeLanguage(page: Page, locale: ShellLocale): Promise<void> {
  const current = (await page.locator('html').getAttribute('lang')) === 'zh-CN' ? 'zh-CN' : 'en-US'
  const copy = getShellCopy(current)
  await showSidebar(page, current)
  await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
  const chooser = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await chooser.isVisible()) await chooser.selectOption('general')
  else
    await page
      .getByRole('navigation', { name: copy.settings.groups, exact: true })
      .getByRole('button', { name: copy.general.group, exact: true })
      .click()
  await page.getByRole('radio', { name: copy.general.options[locale], exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
  await page.getByRole('button', { name: getShellCopy(locale).settings.back, exact: true }).click()
}

async function refreshRoster(page: Page, locale: ShellLocale, workspaceName: string): Promise<void> {
  const copy = getShellCopy(locale)
  await showSidebar(page, locale)
  await page.getByTitle(copy.shell.workspaceActions(workspaceName), { exact: true }).click()
  await page.getByRole('menuitem', { name: copy.shell.roster.refreshWorkspace(workspaceName), exact: true }).click()
}

async function setNativeSize(page: Page, size = { width: 900, height: 600 }): Promise<void> {
  await page.evaluate(async (requested) => {
    function isBridge(value: unknown): value is { invoke(command: string, args: unknown): Promise<unknown> } {
      return !!value && typeof value === 'object' && 'invoke' in value && typeof value.invoke === 'function'
    }
    if (!('__TAURI_INTERNALS__' in window) || !isBridge(window.__TAURI_INTERNALS__))
      throw new Error('The owned native window bridge is unavailable')
    await window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', {
      label: 'main',
      value: { Logical: requested },
    })
  }, size)
  await expect.poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(size)
}

async function noOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}

async function cleanupImagesProfile(profile: string): Promise<void> {
  const target = resolve(profile)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-native-session-images-'))
    throw new Error('Refusing cleanup outside this exact temporary image profile')
  await cleanupNativeSessionFixture(target)
}

async function verify(
  page: Page,
  api: HbarClient,
  workspace: { id: string; name: string },
  workspacePath: string,
  output: string,
) {
  const sessions = createWorkspaceSessionCommandClient(api)
  const models = createModelCommandClient(api)
  const budgets = createBudgetCommandClient(api)
  const cases: object[] = []
  let uploads = 0
  let reads = 0
  let rejectRead = false
  let rejectedReads = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/artifacts' && request.method() === 'POST') uploads++
  })
  // Only the read fails; retry must use the real Host and must never re-upload.
  await page.route('**/api/artifacts/*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    reads++
    if (reads > 128) throw new Error('Unexpected unbounded artifact reads')
    if (rejectRead) {
      rejectedReads++
      await route.fulfill({ status: 503, contentType: 'text/html', body: 'private-image-native-read-failure' })
    } else await route.continue()
  })
  let totalRuns = 0
  for (const locale of ['en-US', 'zh-CN'] as const) {
    await setNativeSize(page)
    await changeLanguage(page, locale)
    const copy = getShellCopy(locale)
    const images = sessionImageCopy(locale)
    for (const width of [900, 1440]) {
      const height = width === 900 ? 600 : 960
      await setNativeSize(page, { width, height })
      await page.reload()
      await expect(page.locator('[data-hbar-app-ui-shell="app"]')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      const session = await sessions.execute(
        'session.create',
        { workspaceId: workspace.id, title: `Native images / 原生图片 ${locale} ${width}` },
        { idempotencyKey: crypto.randomUUID() },
      )
      const initialModel = await models.execute('session.getModel', { sessionId: session.id })
      const configured = await models.execute(
        'session.setModel',
        { sessionId: session.id, modelId: 'local-fixture', baselineRevisions: initialModel.revisions },
        { idempotencyKey: crypto.randomUUID() },
      )
      expect(configured.model?.providerId).toBe('local-fixture')
      expect(configured.model?.imageInput).toBe(true)
      await budgets.execute(
        'session.setBudget',
        { sessionId: session.id, tokens: 100_000 },
        { idempotencyKey: crypto.randomUUID() },
      )
      await refreshRoster(page, locale, workspace.name)
      await page.getByRole('button', { name: copy.shell.openSession(session.title), exact: true }).click()
      await expect(page.getByRole('heading', { name: session.title, exact: true })).toBeVisible()
      const hideSidebar = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })
      if (await hideSidebar.isVisible()) await hideSidebar.click()
      const composer = page.locator('.lumen-prompt-composer')
      const prompt = composer.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = `Native image draft / 原始草稿 ${locale} ${width}`
      await expect(prompt).toBeEnabled()
      await prompt.fill(draft)
      const name = 'same-name-同名不同图片.png'
      const files = [imageFile(0, name), imageFile(1, name)]
      const remainingFile = files[1]
      if (!remainingFile) throw new Error('The image fixture is incomplete')
      const remainingHash = new Bun.CryptoHasher('sha256').update(remainingFile.buffer).digest('hex')
      const uploadsBefore = uploads
      const chooserReady = page.waitForEvent('filechooser')
      await composer.getByRole('button', { name: copy.session.prompt.addAttachment, exact: true }).click()
      await (await chooserReady).setFiles(files)
      const tiles = composer.locator('.lumen-image-tile')
      await expect(tiles).toHaveCount(2)
      await expect(tiles.locator('img')).toHaveCount(2)
      expect(uploads - uploadsBefore).toBe(2)
      const geometry = await tiles.evaluateAll((elements) =>
        elements.map((element) => {
          const r = element.getBoundingClientRect()
          return { width: r.width, height: r.height }
        }),
      )
      const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
      for (const tile of geometry) {
        expect(tile.width).toBeCloseTo(4 * rem, 0)
        expect(tile.height).toBeCloseTo(4 * rem, 0)
      }
      const shot = async (state: string) => {
        await noOverflow(page)
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: join(output, `${state}-${locale}-${width}.png`) })
      }
      await shot('01-draft-two-images')
      const open = composer.getByRole('button', { name: images.open(name), exact: true })
      const dialog = page.getByRole('dialog', { name: images.gallery.title, exact: true })
      const full = dialog.locator('.lumen-image-gallery-media img')
      const dimensions = () =>
        full.evaluate((image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight }))
      await open.first().focus()
      await page.keyboard.press('Enter')
      await expect(dialog).toBeVisible()
      await expect(full).toHaveAttribute('src', /^blob:/)
      await expect.poll(dimensions).toEqual({ width: 480, height: 240 })
      await expect(dialog.getByText(images.gallery.position(1, 2), { exact: true })).toBeVisible()
      await shot('02-original-first-image')
      await page.keyboard.press('ArrowLeft')
      await expect(dialog.getByText(images.gallery.position(2, 2), { exact: true })).toBeVisible()
      await expect.poll(dimensions).toEqual({ width: 240, height: 360 })
      await shot('03-same-name-second-image')
      await page.keyboard.press('ArrowRight')
      await expect.poll(dimensions).toEqual({ width: 480, height: 240 })
      for (let index = 0; index < 8; index++) {
        await page.keyboard.press('Tab')
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
      }
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(open.first()).toBeFocused()
      await expectComposerText(prompt, draft)
      expect((await api.call('session.snapshot', { sessionId: session.id })).runs).toHaveLength(0)
      rejectRead = true
      await open.first().click()
      await expect(dialog.getByText(images.error('READ_FAILED'), { exact: true })).toBeVisible()
      await expect(page.getByText('private-image-native-read-failure')).toHaveCount(0)
      await shot('04-read-failed')
      rejectRead = false
      await dialog.getByRole('button', { name: images.gallery.retry, exact: true }).click()
      await expect.poll(dimensions).toEqual({ width: 480, height: 240 })
      expect(uploads - uploadsBefore).toBe(2)
      await shot('05-read-recovered')
      await page.keyboard.press('Escape')
      await composer
        .getByRole('button', {
          name: copy.session.prompt.removeAttachment({ id: '', kind: 'image', name }),
          exact: true,
        })
        .first()
        .click()
      await expect(tiles).toHaveCount(1)
      await expect(dialog).not.toBeVisible()
      await expectComposerText(prompt, draft)
      await open.first().click()
      await expect(dialog.getByText(images.gallery.position(1, 1), { exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: images.gallery.next, exact: true })).toHaveCount(0)
      await expect.poll(dimensions).toEqual({ width: 240, height: 360 })
      await page.keyboard.press('Escape')
      await shot('06-draft-only-second-remains')
      // This is exactly one real Run against the isolated mock provider per case.
      await composer.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect
        .poll(async () => {
          const snapshot = await api.call('session.snapshot', { sessionId: session.id })
          return snapshot.runs.length === 1 && snapshot.runs[0]?.status === 'completed'
        })
        .toBe(true)
      const snapshot = await api.call('session.snapshot', { sessionId: session.id })
      expect(snapshot.runs).toHaveLength(1)
      const sent = snapshot.messages.find(
        (message) => message.role === 'user' && message.content.some((block) => block.type === 'image'),
      )
      if (!sent) throw new Error('The confirmed user image message is missing')
      const imageBlocks = sent.content.filter((block) => block.type === 'image')
      expect(imageBlocks).toHaveLength(1)
      expect(imageBlocks[0]?.artifact.id).toBe(remainingHash)
      await expect(tiles).toHaveCount(0)
      const message = page.locator(`[data-message-id="${sent.id}"]`)
      const historyOpen = message.getByRole('button', { name: images.open(name), exact: true })
      await expect(historyOpen).toBeVisible()
      await historyOpen.click()
      await expect.poll(dimensions).toEqual({ width: 240, height: 360 })
      await shot('07-sent-history-image')
      await page.keyboard.press('Escape')
      await expect(historyOpen).toBeFocused()
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(historyOpen).toBeVisible()
      await historyOpen.click()
      await expect.poll(dimensions).toEqual({ width: 240, height: 360 })
      await shot('08-reloaded-history-image')
      await page.keyboard.press('Escape')
      const final = await api.call('session.snapshot', { sessionId: session.id })
      expect(final.runs).toHaveLength(1)
      expect(uploads - uploadsBefore).toBe(2)
      totalRuns += final.runs.length
      cases.push({
        locale,
        nativeWindow: { width, height },
        sessionId: session.id,
        sameNameDifferentBytes: true,
        originalDimensions: [
          { width: 480, height: 240 },
          { width: 240, height: 360 },
        ],
        draftTileGeometry: geometry,
        nativeFileChooser: true,
        keyboardWrap: true,
        modalTabContained: true,
        escapeRestoresExactTrigger: true,
        removeOnlyDraft: true,
        noReuploadOnReadRetry: true,
        historyAfterReload: true,
        sentImageArtifactId: remainingHash,
        runIds: final.runs.map((run) => run.id),
        runCount: final.runs.length,
        uploadCount: uploads - uploadsBefore,
      })
    }
  }
  expect(totalRuns).toBe(4)
  expect(uploads).toBe(8)
  expect(rejectedReads).toBeGreaterThanOrEqual(4)
  return {
    cases,
    workspacePath,
    uploadCount: uploads,
    artifactReadCount: reads,
    rejectedReads,
    runCount: totalRuns,
    noCommercialProvider: true,
    provider: 'local-fixture',
    noWorkspaceFileWrite: true,
    setupCommandsPerCase: ['session.create', 'session.setModel', 'session.setBudget'],
    executableBoundary: 'Existing debug launcher, not rebuilt; fresh Host and production Web resources',
    fixtureBoundary:
      'New exact temporary Host/profile/workspace; valid synthetic PNGs through actual UI file chooser; one explicit local Demo Run per case.',
    viewportBoundary:
      'Actual Windows WebView2 window sizes 900x600 / 1440x960, no emulated mobile or whole desktop smoke claim.',
  }
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') throw new Error('The isolated native image gallery check requires Windows WebView2')
  await new Promise<void>((accept, reject) => {
    const probe = createServer()
    probe.once('error', () => reject(new Error('Debug port 9443 is occupied; refusing to attach')))
    probe.listen({ port: DEBUG_PORT, host: '127.0.0.1', exclusive: true }, () =>
      probe.close((error) => (error ? reject(error) : accept())),
    )
  })
  const executable = resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/debug/hbar-desktop.exe')
  await access(executable)
  const resourceHtml = await readFile(resolve('dist/desktop-resources/web/index.html'), 'utf8')
  const expectedAsset = process.env.HBAR_NATIVE_EXPECTED_ASSET
  if (!expectedAsset || !/^index-[A-Za-z0-9_-]+\.js$/.test(expectedAsset) || !resourceHtml.includes(expectedAsset))
    throw new Error('Expected freshly verified Host/Web resource bundle is unavailable; refusing an older build')
  const root = await mkdtemp(join(tmpdir(), 'hbar-native-session-images-'))
  const workspacePath = await mkdtemp(join(tmpdir(), 'hbar-native-images-workspace-'))
  const output = resolve('artifacts/desktop-images/native', basename(root))
  await mkdir(output, { recursive: true })
  const hostExecutable = resolve('dist/desktop-resources/bun.exe')
  const hostScript = resolve('dist/desktop-resources/host.js')
  const launchedAt = Date.now()
  const native = Bun.spawn([executable], {
    env: {
      ...process.env,
      HBAR_HOME: root,
      HBAR_DATA_ROOT: root,
      HBAR_CACHE_ROOT: join(root, 'cache'),
      HBAR_WORKSPACE: workspacePath,
      HBAR_DEMO: '1',
      WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview-profile'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${DEBUG_PORT}`,
    },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: Bun.file(join(output, 'launcher.stderr.log')),
    windowsHide: true,
  })
  let hostIdentity: ProcessIdentity | undefined
  let supervisorIdentity: ProcessIdentity | undefined
  let desktopIdentity: ProcessIdentity | undefined
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
  let api: HbarClient | undefined
  const errors: string[] = []
  const nativeConsole: { type: string; text: string }[] = []
  let result: unknown = null
  const failures: unknown[] = []
  const owned = (process: ProcessIdentity): boolean => {
    const flagPath = (flag: string, path: string) => {
      const index = process.argv.indexOf(flag, 2)
      return index !== -1 && process.argv.lastIndexOf(flag) === index && samePath(process.argv[index + 1], path)
    }
    return (
      samePath(process.executable, hostExecutable) &&
      samePath(process.argv[0], hostExecutable) &&
      samePath(process.argv[1], hostScript) &&
      flagPath('--data-root', root) &&
      flagPath('--cache-root', join(root, 'cache')) &&
      flagPath('--workspace', workspacePath)
    )
  }
  const stopCaptured = async (expected: ProcessIdentity) => {
    const current = await queryProcess(expected.pid)
    if (!current) return
    if (
      !owned(current) ||
      current.createdAt !== expected.createdAt ||
      current.commandLine !== expected.commandLine ||
      current.parentPid !== expected.parentPid
    )
      throw new Error('Fixture PID identity changed; refusing to terminate')
    process.kill(current.pid)
    await until(async () => {
      if (await queryProcess(expected.pid)) throw new Error('Owned fixture process has not exited')
    })
  }
  try {
    desktopIdentity = (await queryProcess(native.pid)) ?? undefined
    if (
      !desktopIdentity ||
      !samePath(desktopIdentity.executable, executable) ||
      !samePath(desktopIdentity.argv[0], executable) ||
      desktopIdentity.parentPid !== process.pid ||
      Date.parse(desktopIdentity.createdAt) < launchedAt - 2000
    )
      throw new Error('The newly launched desktop identity is not confirmed')
    const connection = await until(async () =>
      z
        .object({
          url: z.url(),
          token: z.string().min(1),
          pid: z.number().int().positive(),
          instanceId: z.string().min(1),
        })
        .parse(JSON.parse(await readFile(join(root, 'settings', 'connection.json'), 'utf8')) as unknown),
    )
    const address = new URL(connection.url)
    if (
      address.protocol !== 'http:' ||
      address.hostname !== '127.0.0.1' ||
      !address.port ||
      ['45025', '45027'].includes(address.port)
    )
      throw new Error('The fixture Host address is not isolated')
    const host = await queryProcess(connection.pid)
    if (!host || !owned(host) || !host.argv.includes('--supervised'))
      throw new Error('The connection does not identify this owned Host')
    const supervisor = await queryProcess(host.parentPid)
    if (
      !supervisor ||
      !owned(supervisor) ||
      !supervisor.argv.includes('--supervisor') ||
      supervisor.parentPid !== native.pid
    )
      throw new Error('The Host is not descended from this launched desktop')
    hostIdentity = host
    supervisorIdentity = supervisor
    api = new HbarClient(connection.url, connection.token)
    await api.connect()
    await until(async () => {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`, { signal: AbortSignal.timeout(1000) })
      const targets = z.array(z.object({ url: z.string() })).parse(await response.json())
      if (!targets.some((target) => new URL(target.url).origin === address.origin))
        throw new Error('Debugging endpoint has no target at this fixture Host origin')
    })
    browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`))
    const targetBrowser = browser
    const page = await until(async () => {
      const found = targetBrowser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => new URL(page.url()).origin === address.origin)
      if (!found) throw new Error('The owned native WebView is not ready')
      return found
    })
    page.setDefaultTimeout(15_000)
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (nativeConsole.length < 100 && ['error', 'warning'].includes(message.type()))
        nativeConsole.push({ type: message.type(), text: message.text().slice(0, 2048) })
    })
    await expect(page.locator(`script[src$="${expectedAsset}"]`)).toHaveCount(1)
    await page.locator('[data-hbar-app-ui-shell="app"]').waitFor()
    await setNativeSize(page)
    const bootstrap = await api.call('system.bootstrap', {})
    const workspace = bootstrap.workspaces.find((item) => samePath(item.path, workspacePath))
    if (!workspace) throw new Error('The fixture workspace was not registered')
    result = await verify(page, api, workspace, workspacePath, output)
    expect(errors).toEqual([])
    await writeFile(
      join(output, 'verification.json'),
      JSON.stringify(
        {
          executable,
          debugPort: DEBUG_PORT,
          resourceHtml,
          existingExeNotRebuilt: true,
          hostPort: address.port,
          desktopIdentity,
          hostIdentity,
          supervisorIdentity,
          result,
          errors,
          nativeConsole,
          passed: true,
        },
        null,
        2,
      ),
    )
    console.log(
      `PASS: native en/zh 900×600 and 1440×960 image file chooser, original dimensions, gallery, remove, read retry, Send/history/reload; 4 isolated Demo Runs. Evidence: ${output}`,
    )
  } catch (error) {
    failures.push(error)
    const capturedPage = browser?.contexts().flatMap((context) => context.pages())[0]
    if (capturedPage) {
      await capturedPage.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
      await writeFile(
        join(output, 'failure-dom.json'),
        JSON.stringify(
          await capturedPage.evaluate(() => ({
            url: location.href,
            locale: document.documentElement.lang,
            messageIds: [...document.querySelectorAll('[data-message-id]')].map((element) =>
              element.getAttribute('data-message-id'),
            ),
            text: document.body.innerText.slice(0, 12_000),
          })),
          null,
          2,
        ),
      )
    }
    await writeFile(
      join(output, 'verification.json'),
      JSON.stringify(
        {
          executable,
          debugPort: DEBUG_PORT,
          resourceHtml,
          existingExeNotRebuilt: true,
          desktopIdentity,
          hostIdentity,
          supervisorIdentity,
          result,
          errors,
          nativeConsole,
          passed: false,
          failure: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    )
  } finally {
    const cleanup = async () => {
      api?.disconnect()
      await browser?.close().catch(() => {})
      if (native.exitCode === null) {
        const currentDesktop = await queryProcess(native.pid)
        if (
          !desktopIdentity ||
          !currentDesktop ||
          currentDesktop.createdAt !== desktopIdentity.createdAt ||
          currentDesktop.parentPid !== desktopIdentity.parentPid ||
          currentDesktop.commandLine !== desktopIdentity.commandLine ||
          !samePath(currentDesktop.executable, executable)
        )
          throw new Error('Desktop identity changed; refusing native cleanup')
        native.kill()
      }
      if (!hostIdentity || !supervisorIdentity) {
        await awaitNativeExit(native.exited)
        console.error(`Unverified startup; retaining only this run's directories: ${root}, ${workspacePath}`)
        return
      }
      const capturedSupervisor = supervisorIdentity
      const capturedHost = hostIdentity
      const cleanupFailures: unknown[] = []
      const attempt = async (action: () => Promise<void>) => {
        try {
          await action()
        } catch (error) {
          cleanupFailures.push(error)
        }
      }
      // Launcher stderr is a file, not a pipe: cleanup never waits for an unproven descendant's EOF.
      await attempt(() => stopCaptured(capturedSupervisor))
      await attempt(() => stopCaptured(capturedHost))
      await attempt(() => awaitNativeExit(native.exited))
      if (cleanupFailures.length === 0) {
        await cleanupImagesProfile(root)
        await cleanupWorkspace(workspacePath)
      }
      await writeFile(
        join(output, 'cleanup.json'),
        JSON.stringify(
          {
            desktopPid: native.pid,
            supervisorPid: supervisorIdentity.pid,
            hostPid: hostIdentity.pid,
            cleanedRoot: cleanupFailures.length === 0 ? root : null,
            cleanedWorkspace: cleanupFailures.length === 0 ? workspacePath : null,
            errors: cleanupFailures.map((error) => (error instanceof Error ? error.message : String(error))),
            protectedPidsUntouched: [...PROTECTED_PIDS],
          },
          null,
          2,
        ),
      )
      if (cleanupFailures.length) throw new AggregateError(cleanupFailures, 'Owned fixture cleanup failed')
    }
    await cleanup().catch((error: unknown) => failures.push(error))
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'Native verification and owned cleanup failed')
}

if (import.meta.main) await main()
