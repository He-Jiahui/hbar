import { chromium, expect, type Page } from '@playwright/test'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'
import {
  HbarClient,
  createGoalPlanCommandClient,
  createModelCommandClient,
  createRunCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from '../e2e/support/composer-text'
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
public static class HbarExecutionFixtureArguments {
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
[ordered]@{ pid = [int]$fixtureProcess.ProcessId; parentPid = [int]$fixtureProcess.ParentProcessId; executable = $fixtureProcess.ExecutablePath; commandLine = $fixtureProcess.CommandLine; argv = @([HbarExecutionFixtureArguments]::Parse($fixtureProcess.CommandLine)); createdAt = $fixtureProcess.CreationDate.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress
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
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-native-execution-workspace-'))
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

async function verify(
  page: Page,
  api: HbarClient,
  workspace: { id: string; name: string },
  workspacePath: string,
  output: string,
) {
  const sessions = createWorkspaceSessionCommandClient(api)
  const runs = createRunCommandClient(api)
  const models = createModelCommandClient(api)
  const goals = createGoalPlanCommandClient(api)
  const cases: object[] = []
  for (const locale of ['en-US', 'zh-CN'] as const) {
    await changeLanguage(page, locale)
    const copy = getShellCopy(locale)
    const created = await sessions.execute(
      'session.create',
      { workspaceId: workspace.id, title: `Native retained A / 原会话 ${locale}` },
      { idempotencyKey: crypto.randomUUID() },
    )
    const configuration = await models.execute('session.getModel', { sessionId: created.id })
    await models.execute(
      'session.setModel',
      { sessionId: created.id, modelId: 'local-fixture', baselineRevisions: configuration.revisions },
      { idempotencyKey: crypto.randomUUID() },
    )
    const history = `Native real demo history / 原生真实示例历史 ${locale}`
    const accepted = await runs.execute(
      'run.submit',
      { sessionId: created.id, modelId: 'local-fixture', input: { text: history, images: [] } },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
      .toBe('completed')
    // The real first demo Run may update its title. Locate the actual confirmed Session, not the creation response.
    const session = await sessions.execute('session.get', { sessionId: created.id })
    if (!session || session.archived) throw new Error('The completed native history Session is unavailable')
    await goals.execute('goal.set', {
      sessionId: session.id,
      objective: `Existing paused Goal ${locale}`,
      status: 'paused',
    })
    await refreshRoster(page, locale, workspace.name)
    await page.getByRole('button', { name: copy.shell.openSession(session.title), exact: true }).click()
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const draft = `Original native draft / 原稿保持 ${locale}`
    const attachmentName = `original-native-${locale}.txt`
    await expect(prompt).toBeEditable()
    await prompt.fill(draft)
    await page.locator('.hbar-composer-attachment-target input[type="file"]').setInputFiles({
      name: attachmentName,
      mimeType: 'text/plain',
      buffer: Buffer.from('Original owned native attachment'),
    })
    await expect(page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
    await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
    const files = page.locator('.hbar-app-react-file-workspace')
    await expect(files).toBeVisible()
    const originalFiles = await files.elementHandle()
    if (!originalFiles) throw new Error('The original Files surface identity is missing')
    try {
      const before = await api.call('session.snapshot', { sessionId: session.id })
      const modelBefore = await models.execute('session.getModel', { sessionId: session.id })
      const goalBefore = await goals.execute('goal.snapshot', { sessionId: session.id })
      await sessions.execute('session.archive', { sessionId: session.id, archived: true })
      await refreshRoster(page, locale, workspace.name)
      await expect(page.getByRole('tab', { name: session.title, exact: true })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: session.title, exact: true })).toBeVisible()
      await expectComposerText(prompt, draft)
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
      await expect(files).toBeVisible()
      const notice = page.locator('[data-session-execution-access="archived"]')
      await expect(notice).toContainText(copy.session.executionAccess.archived)
      await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: copy.session.prompt.addAttachment, exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: copy.session.intent.resume, exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: copy.session.intent.clear, exact: true })).toBeEnabled()
      await prompt.press('Enter')
      await noOverflow(page)
      await page.screenshot({ path: join(output, `archived-retained-files-${locale}-900.png`) })
      // Files is an actual drawer overlay at 900. Preserve its DOM and resize the real native window;
      // do not force clicks through it or close Files to claim continuity.
      await setNativeSize(page, { width: 1440, height: 960 })
      expect(await originalFiles.evaluate((element) => element.isConnected)).toBe(true)
      await page.locator('.hbar-composer-model-trigger').click()
      const picker = page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
      await expect(picker.getByRole('option')).not.toHaveCount(0)
      for (const option of await picker.getByRole('option').all()) await expect(option).toBeDisabled()
      await picker.getByRole('button', { name: copy.session.modelPicker.close, exact: true }).click()
      await noOverflow(page)
      await page.screenshot({ path: join(output, `archived-controls-${locale}-1440.png`) })
      await notice
        .getByRole('button', { name: copy.session.executionAccess.openArchived(workspace.name), exact: true })
        .click()
      const list = page.getByRole('region', { name: copy.shell.archive.listTitle(workspace.name), exact: true })
      await expect(list).toBeVisible()
      await list.getByRole('button', { name: copy.shell.archive.restoreSession(session.title), exact: true }).click()
      await expect
        .poll(async () => (await sessions.execute('session.get', { sessionId: session.id }))?.archived)
        .toBe(false)
      await expect(notice).toHaveCount(0)
      await expect(page.getByRole('tab', { name: session.title, exact: true })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: session.title, exact: true })).toBeVisible()
      await expectComposerText(prompt, draft)
      await expect(files).toBeVisible()
      expect(await originalFiles.evaluate((element) => element.isConnected)).toBe(true)
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
      const after = await api.call('session.snapshot', { sessionId: session.id })
      expect(after.runs).toEqual(before.runs)
      expect(after.messages).toEqual(before.messages)
      expect(await models.execute('session.getModel', { sessionId: session.id })).toEqual(modelBefore)
      expect(await goals.execute('goal.snapshot', { sessionId: session.id })).toEqual(goalBefore)
      await page.screenshot({ path: join(output, `restored-retained-${locale}-1440.png`) })
      await setNativeSize(page)
      await expectComposerText(prompt, draft)
      await expect(files).toBeVisible()
      expect(await originalFiles.evaluate((element) => element.isConnected)).toBe(true)
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
      await noOverflow(page)
      await page.screenshot({ path: join(output, `restored-retained-${locale}-900.png`) })
      cases.push({
        locale,
        retainedViewport: { width: 900, height: 600 },
        restoreInteractionViewport: { width: 1440, height: 960 },
        sessionId: session.id,
        workspaceId: workspace.id,
        historyRunId: accepted.operationId,
        preservedDraft: true,
        preservedAttachment: true,
        sameFilesDom: true,
        retiredTabNotReopened: true,
        noAdditionalRun: true,
      })
    } finally {
      await originalFiles.dispose()
    }
    await page.getByRole('button', { name: copy.files.close, exact: true }).click()
    const controlsSession = await sessions.execute(
      'session.create',
      { workspaceId: workspace.id, title: `Native no-Files controls ${locale}` },
      { idempotencyKey: crypto.randomUUID() },
    )
    await goals.execute('goal.set', {
      sessionId: controlsSession.id,
      objective: `Readonly native controls ${locale}`,
      status: 'paused',
    })
    await refreshRoster(page, locale, workspace.name)
    await page.getByRole('button', { name: copy.shell.openSession(controlsSession.title), exact: true }).click()
    await sessions.execute('session.archive', { sessionId: controlsSession.id, archived: true })
    await refreshRoster(page, locale, workspace.name)
    await expect(page.locator('[data-session-execution-access="archived"]')).toBeVisible()
    await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: copy.session.prompt.addAttachment, exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: copy.session.intent.resume, exact: true })).toBeDisabled()
    await page.locator('.hbar-composer-model-trigger').click()
    const controlsPicker = page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
    await expect(controlsPicker.getByRole('option')).not.toHaveCount(0)
    for (const option of await controlsPicker.getByRole('option').all()) await expect(option).toBeDisabled()
    await page.screenshot({ path: join(output, `archived-no-files-controls-${locale}-900.png`) })
    await controlsPicker.getByRole('button', { name: copy.session.modelPicker.close, exact: true }).click()
    await noOverflow(page)
    cases.push({ locale, sessionId: controlsSession.id, noFilesControlsViewport: { width: 900, height: 600 } })
  }
  const locale = 'zh-CN'
  const copy = getShellCopy(locale)
  const active = await sessions.execute(
    'session.create',
    { workspaceId: workspace.id, title: 'Native original active Run / 原轮取消' },
    { idempotencyKey: crypto.randomUUID() },
  )
  await refreshRoster(page, locale, workspace.name)
  await page.getByRole('button', { name: copy.shell.openSession(active.title), exact: true }).click()
  const operation = await runs.execute(
    'run.submit',
    {
      sessionId: active.id,
      modelId: 'local-fixture',
      input: {
        text: '/tool write_file {"path":"must-not-execute.txt","text":"cancel this original tool"}',
        images: [],
        approval: 'ask',
      },
    },
    { idempotencyKey: crypto.randomUUID() },
  )
  await expect
    .poll(async () => (await runs.execute('operation.get', { operationId: operation.operationId })).status)
    .toBe('waiting_approval')
  let rejected: unknown
  try {
    await sessions.execute('session.archive', { sessionId: active.id, archived: true })
  } catch (error) {
    rejected = error
  }
  expect(rejected).toMatchObject({ code: 'BUSY' })
  await expect(page.locator('[data-session-execution-access="archived"]')).toHaveCount(0)
  const stop = page.getByRole('button', { name: copy.session.prompt.stop, exact: true })
  await expect(stop).toBeEnabled()
  await noOverflow(page)
  await page.screenshot({ path: join(output, 'active-busy-stop-zh-CN-900.png') })
  await stop.click()
  await expect
    .poll(async () => (await runs.execute('operation.get', { operationId: operation.operationId })).status)
    .toBe('cancelled')
  expect((await sessions.execute('session.get', { sessionId: active.id }))?.archived).toBe(false)
  const absent = await access(join(workspacePath, 'must-not-execute.txt')).then(
    () => false,
    () => true,
  )
  expect(absent).toBe(true)
  await page.screenshot({ path: join(output, 'cancelled-original-zh-CN-900.png') })
  return {
    cases,
    active: {
      sessionId: active.id,
      operationId: operation.operationId,
      archiveRejectedBusy: true,
      stopConfirmedCancelled: true,
      toolNotExecuted: true,
    },
    noCommercialProvider: true,
    historySource: 'One genuine local-fixture demo Run per locale; no synthetic historical messages',
  }
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') throw new Error('The isolated native execution check requires Windows WebView2')
  await new Promise<void>((accept, reject) => {
    const probe = createServer()
    probe.once('error', () => reject(new Error('Debug port 9443 is occupied; refusing to attach')))
    probe.listen({ port: DEBUG_PORT, host: '127.0.0.1', exclusive: true }, () =>
      probe.close((error) => (error ? reject(error) : accept())),
    )
  })
  const executable = resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/debug/hbar-desktop.exe')
  await access(executable)
  const root = await mkdtemp(join(tmpdir(), 'hbar-native-session-execution-'))
  const workspacePath = await mkdtemp(join(tmpdir(), 'hbar-native-execution-workspace-'))
  const output = resolve('artifacts/session-execution-access/native', basename(root))
  await mkdir(output, { recursive: true })
  const hostExecutable = resolve('dist/desktop-resources/bun.exe')
  const hostScript = resolve('dist/desktop-resources/host.js')
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
    if (!desktopIdentity || !samePath(desktopIdentity.executable, executable))
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
          hostPort: address.port,
          desktopIdentity,
          hostIdentity,
          supervisorIdentity,
          result,
          errors,
          passed: true,
        },
        null,
        2,
      ),
    )
    console.log(
      `PASS: native en/zh 900×600 retained views and no-Files controls, actual 1440×960 Restore with the same Files DOM, return to 900, and BUSY/Stop cancellation. Evidence: ${output}`,
    )
  } catch (error) {
    failures.push(error)
    await writeFile(
      join(output, 'verification.json'),
      JSON.stringify(
        {
          executable,
          debugPort: DEBUG_PORT,
          desktopIdentity,
          hostIdentity,
          supervisorIdentity,
          result,
          errors,
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
      if (native.exitCode === null) native.kill()
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
        await cleanupNativeSessionFixture(root)
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
