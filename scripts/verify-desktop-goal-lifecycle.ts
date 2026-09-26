import { chromium, expect } from '@playwright/test'
import { access, mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'
import { HbarClient, createGoalPlanCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from '../e2e/support/composer-text'
import { cleanupNativeSessionFixture } from './native-fixture-cleanup'

// No build, installation or user-process attachment. The caller refreshes debug Host/Web resources first.
if (process.platform !== 'win32') throw new Error('This isolated native Goal check requires Windows WebView2')
const debugPort = 9441
await new Promise<void>((resolve, reject) => {
  const probe = createServer()
  probe.once('error', () => reject(new Error('Native Goal debugging port is occupied; refusing to attach')))
  probe.listen({ port: debugPort, host: '127.0.0.1', exclusive: true }, () => {
    probe.close((error) => (error ? reject(error) : resolve()))
  })
})
const executable = resolve(process.env.HBAR_DESKTOP_EXE ?? 'apps/desktop/src-tauri/target/debug/hbar-desktop.exe')
await access(executable) // Fail before creating any profile when the existing launcher is unavailable.
const root = await mkdtemp(join(tmpdir(), 'hbar-native-session-goal-'))
const workspacePath = await mkdtemp(join(tmpdir(), 'hbar-native-goal-workspace-'))
const output = resolve('artifacts/goal-lifecycle/native')
await mkdir(output, { recursive: true })
const hostScript = resolve('dist/desktop-resources/host.js')
const hostExecutable = resolve('dist/desktop-resources/bun.exe')
const child = Bun.spawn([executable], {
  env: {
    ...process.env,
    HBAR_HOME: root,
    HBAR_WORKSPACE: workspacePath,
    HBAR_DEMO: '1',
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
    WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview-profile'),
  },
  stdin: 'ignore',
  stdout: 'ignore',
  stderr: 'ignore',
  windowsHide: true,
})
const processSchema = z
  .object({
    pid: z.number().int().positive(),
    parentPid: z.number().int().nonnegative(),
    executable: z.string().min(1),
    commandLine: z.string().min(1),
    argv: z.array(z.string()).min(2).max(32),
    createdAt: z.string().min(1),
  })
  .nullable()
type ProcessIdentity = NonNullable<z.output<typeof processSchema>>
let hostIdentity: ProcessIdentity | undefined
let supervisorIdentity: ProcessIdentity | undefined
let api: HbarClient | undefined
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined

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

async function queryProcess(pid: number): Promise<ProcessIdentity | null> {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid fixture process identity')
  // Only a captured numeric PID is interpolated. No path, user data or secret becomes shell code.
  // Use Windows' own decoder for quoted/unquoted argv, not substring or whitespace-split ownership checks.
  const command = `$fixtureProcess = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($null -eq $fixtureProcess) { 'null' } else {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HbarGoalFixtureArguments {
  [DllImport("shell32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern IntPtr CommandLineToArgvW(string commandLine, out int count);
  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr pointer);
  public static string[] Parse(string line) {
    int count;
    IntPtr pointer = CommandLineToArgvW(line, out count);
    if (pointer == IntPtr.Zero) throw new InvalidOperationException("Unable to decode fixture arguments");
    try {
      if (count < 2 || count > 32) throw new InvalidOperationException("Unbounded fixture arguments");
      string[] result = new string[count];
      for (int index = 0; index < count; index++)
        result[index] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(pointer, index * IntPtr.Size));
      return result;
    } finally { LocalFree(pointer); }
  }
}
'@
[ordered]@{ pid = [int]$fixtureProcess.ProcessId; parentPid = [int]$fixtureProcess.ParentProcessId; executable = $fixtureProcess.ExecutablePath; commandLine = $fixtureProcess.CommandLine; argv = @([HbarGoalFixtureArguments]::Parse($fixtureProcess.CommandLine)); createdAt = $fixtureProcess.CreationDate.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress
}`
  const read = Bun.spawn(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
    timeout: 10_000,
  })
  const [stdout, stderr, exit] = await Promise.all([
    new Response(read.stdout).text(),
    new Response(read.stderr).text(),
    read.exited,
  ])
  if (exit !== 0) throw new Error(`Could not verify fixture process ownership: ${stderr.trim()}`)
  return processSchema.parse(JSON.parse(stdout.trim()) as unknown)
}

function ownedHostProcess(value: ProcessIdentity): boolean {
  const matchesPath = (actual: string | undefined, expected: string): boolean =>
    actual !== undefined && isAbsolute(actual) && resolve(actual).toLowerCase() === resolve(expected).toLowerCase()
  const flagPath = (flag: string, expected: string): boolean => {
    const index = value.argv.indexOf(flag, 2)
    return index !== -1 && value.argv.lastIndexOf(flag) === index && matchesPath(value.argv[index + 1], expected)
  }
  return (
    matchesPath(value.executable, hostExecutable) &&
    matchesPath(value.argv[0], hostExecutable) &&
    matchesPath(value.argv[1], hostScript) &&
    flagPath('--data-root', root) &&
    flagPath('--cache-root', join(root, 'cache')) &&
    flagPath('--workspace', workspacePath)
  )
}

async function stopCapturedProcess(expected: ProcessIdentity): Promise<void> {
  const current = await queryProcess(expected.pid)
  if (!current) return
  if (
    !ownedHostProcess(current) ||
    current.createdAt !== expected.createdAt ||
    current.executable !== expected.executable ||
    current.commandLine !== expected.commandLine ||
    current.parentPid !== expected.parentPid
  )
    throw new Error('Fixture PID identity changed; refusing to terminate an unverified process')
  try {
    process.kill(current.pid)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error
  }
  await until(async () => {
    if (await queryProcess(expected.pid)) throw new Error('Owned fixture process has not exited')
  })
}

async function cleanupWorkspace(): Promise<void> {
  const target = resolve(workspacePath)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-native-goal-workspace-'))
    throw new Error('Refusing to remove a path outside this owned temporary workspace')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

try {
  const connection = await until(async () =>
    z
      .object({
        url: z.url().refine((value) => {
          const parsed = new URL(value)
          return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' && parsed.port !== ''
        }),
        token: z.string().min(1),
        pid: z.number().int().positive(),
        instanceId: z.string().min(1),
      })
      .parse(JSON.parse(await readFile(join(root, 'settings', 'connection.json'), 'utf8')) as unknown),
  )
  const host = await queryProcess(connection.pid)
  if (!host || !ownedHostProcess(host) || !host.argv.includes('--supervised'))
    throw new Error('Connection file does not identify this disposable fixture Host')
  const supervisor = await queryProcess(host.parentPid)
  if (
    !supervisor ||
    !ownedHostProcess(supervisor) ||
    !supervisor.argv.includes('--supervisor') ||
    supervisor.parentPid !== child.pid
  )
    throw new Error('Fixture Host is not descended from the desktop process started by this script')
  hostIdentity = host
  supervisorIdentity = supervisor
  api = new HbarClient(connection.url, connection.token)
  await api.connect()
  const bootstrap = await api.call('system.bootstrap', {})
  const workspace = bootstrap.workspaces.find((item) => resolve(item.path) === resolve(workspacePath))
  if (!workspace) throw new Error('The native fixture did not register its isolated workspace')
  const session = await createWorkspaceSessionCommandClient(api).execute(
    'session.create',
    { workspaceId: workspace.id, title: 'Native Goal lifecycle verification' },
    { idempotencyKey: crypto.randomUUID() },
  )
  const goals = createGoalPlanCommandClient(api)
  const objective = `Native original Goal / 原生旧目标：${'Historical evidence-中文长目标-'.repeat(14)}`
  const old = await goals.execute('goal.set', {
    sessionId: session.id,
    objective,
    status: 'paused',
    tokenBudget: 2000,
  })
  const oldId = old.goal?.goalId
  if (!oldId) throw new Error('The paused fixture Goal was not confirmed')
  expect(old.goal?.status).toBe('paused')

  // Before connecting CDP, require a target at this script's newly created Host origin.
  await until(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1000) })
    const targets = z.array(z.object({ url: z.string() })).parse(await response.json())
    if (!targets.some((target) => new URL(target.url).origin === new URL(connection.url).origin))
      throw new Error('Debugging endpoint does not belong to this temporary Host; refusing to attach')
  })
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`))
  const targetBrowser = browser
  const page = await until(async () => {
    const value = targetBrowser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => new URL(candidate.url()).origin === new URL(connection.url).origin)
    if (!value) throw new Error('The isolated native WebView is not ready')
    return value
  })
  page.setDefaultTimeout(15_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('[data-hbar-app-ui-shell="app"]').waitFor()
  await page.reload()
  const locale = await page.evaluate(() => document.documentElement.lang)
  const copy = getShellCopy(locale === 'zh-CN' ? 'zh-CN' : 'en-US')
  await page.getByRole('button', { name: copy.shell.openSession(session.title), exact: true }).click()
  const cards = page.locator('[data-goal-event-id]')
  const summary = page.locator('.hbar-session-current-goal .hbar-composer-goal-strip')
  const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
  const draft = 'Unsent native draft / 原生未发送草稿，独立于目标历史。'
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toHaveAttribute('data-goal-action', 'created')
  await expect(cards.first()).toContainText(objective)
  await expect(summary).toContainText(objective)
  await prompt.fill(draft)
  await expectComposerText(prompt, draft)
  await page.screenshot({ path: join(output, 'paused-original-1440.png') })

  await goals.execute('goal.update', { sessionId: session.id, status: 'complete' })
  await expect(cards).toHaveCount(2)
  await expect(cards.last()).toHaveAttribute('data-goal-action', 'completed')
  await expect(cards.last()).toContainText(objective)
  await expect(summary).toHaveCount(0)
  await expectComposerText(prompt, draft)
  await page.screenshot({ path: join(output, 'completed-retained-1440.png') })
  await goals.execute('goal.clear', { sessionId: session.id, expectedGoalId: oldId })
  await expect(cards).toHaveCount(3)
  await expect(cards.last()).toHaveAttribute('data-goal-action', 'cleared')
  await expect(cards.last()).toContainText(objective)
  await expect(cards.nth(1)).toHaveAttribute('data-goal-action', 'completed')
  await expect(summary).toHaveCount(0)
  await expectComposerText(prompt, draft)
  await page.screenshot({ path: join(output, 'cleared-retained-1440.png') })

  const nextObjective = 'New paused Goal / 新暂停目标，不得替换历史旧目标。'
  const next = await goals.execute('goal.set', {
    sessionId: session.id,
    objective: nextObjective,
    status: 'paused',
    tokenBudget: 5000,
  })
  const nextId = next.goal?.goalId
  if (!nextId) throw new Error('The second paused fixture Goal was not confirmed')
  expect(nextId).not.toBe(oldId)
  expect(next.goal?.status).toBe('paused')
  await expect(cards).toHaveCount(4)
  await expect(cards.first()).toContainText(objective)
  await expect(cards.first()).not.toContainText(nextObjective)
  await expect(cards.nth(1)).toContainText(objective)
  await expect(cards.nth(2)).toContainText(objective)
  await expect(summary).toContainText(nextObjective)
  await expect(page.locator('.hbar-app-react-session-footer .hbar-composer-goal-strip')).toHaveCount(0)
  await expect(page.locator('.hbar-app-react-session-empty-hero')).toHaveCount(0)
  const history = await goals.history({ sessionId: session.id, limit: 100 })
  expect(history.items.map((item) => item.goal?.status ?? null)).toEqual(['paused', 'complete', null, 'paused'])
  expect(history.items[0]?.goal?.objective).toBe(objective)
  expect(history.items[1]?.goal?.goalId).toBe(oldId)
  expect(history.items[3]?.goal?.goalId).toBe(nextId)
  expect(history.preceding).toEqual({ seq: 0, goal: null })
  expect(history.nextBeforeSeq).toBeNull()
  const identities = history.items.map((item) => item.eventId)
  expect(await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-goal-event-id')))).toEqual(
    identities,
  )
  expect((await api.call('session.snapshot', { sessionId: session.id })).runs).toEqual([])

  const geometry: unknown[] = []
  for (const size of [
    { width: 1440, height: 960 },
    { width: 900, height: 600 },
  ]) {
    await page.evaluate(async (size) => {
      function isBridge(value: unknown): value is { invoke(command: string, args: unknown): Promise<unknown> } {
        return !!value && typeof value === 'object' && 'invoke' in value && typeof value.invoke === 'function'
      }
      if (!('__TAURI_INTERNALS__' in window) || !isBridge(window.__TAURI_INTERNALS__))
        throw new Error('Native window bridge is unavailable')
      await window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: size } })
    }, size)
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(size.width)
    await expect.poll(() => page.evaluate(() => innerHeight)).toBe(size.height)
    await expect
      .poll(() =>
        page.locator('.hbar-session-current-goal').evaluate((node) => {
          const header = node.previousElementSibling
          const timeline = document.querySelector('.hbar-app-react-session-main')
          if (
            !header?.classList.contains('lumen-page-header') ||
            !timeline ||
            timeline.parentElement !== node.parentElement
          )
            return false
          return (
            header.getBoundingClientRect().bottom <= node.getBoundingClientRect().top + 1 &&
            node.getBoundingClientRect().bottom <= timeline.getBoundingClientRect().top + 1
          )
        }),
      )
      .toBe(true)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    const heading = cards.first().locator('.hbar-goal-lifecycle-heading')
    await heading.scrollIntoViewIfNeeded()
    await expect(cards.first()).toContainText(objective)
    await expect(heading).toHaveAttribute('aria-expanded', 'true')
    const bodyId = await heading.getAttribute('aria-controls')
    if (!bodyId) throw new Error('Historical Goal disclosure lacks its controlled body identity')
    await expect(cards.first().locator('.hbar-goal-lifecycle-body')).toHaveAttribute('id', bodyId)
    expect(await cards.first().evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await expectComposerText(prompt, draft)
    await page.screenshot({ path: join(output, `history-expanded-${size.width}.png`) })
    await heading.focus()
    await page.keyboard.press('Enter')
    await expect(heading).toHaveAttribute('aria-expanded', 'false')
    await expect(cards.first().locator('.hbar-goal-lifecycle-body')).toBeHidden()
    await expect(heading).toBeFocused()
    await expectComposerText(prompt, draft)
    await page.screenshot({ path: join(output, `history-collapsed-${size.width}.png`) })
    await page.keyboard.press('Space')
    await expect(heading).toHaveAttribute('aria-expanded', 'true')
    await expect(cards.first().locator('.hbar-goal-lifecycle-body')).toBeVisible()
    await expect(heading).toBeFocused()
    await expectComposerText(prompt, draft)
    geometry.push({ ...size, summaryBelowHeader: true, noHorizontalOverflow: true, draftRetained: true })
  }
  await cards.first().getByRole('button', { name: copy.session.goalLifecycle.showObjective, exact: true }).click()
  await expect(
    cards.first().getByRole('button', { name: copy.session.goalLifecycle.hideObjective, exact: true }),
  ).toHaveAttribute('aria-expanded', 'true')
  expect(await cards.first().evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await expectComposerText(prompt, draft)
  await page.screenshot({ path: join(output, 'full-original-objective-900.png') })

  // Drafts are currently in-memory. Reload validates canonical history, not nonexistent draft persistence.
  await page.reload()
  await expect(cards).toHaveCount(4)
  expect(await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-goal-event-id')))).toEqual(
    identities,
  )
  await expect(cards.nth(1)).toHaveAttribute('data-goal-action', 'completed')
  await expect(cards.nth(1)).toContainText(objective)
  await expect(cards.nth(2)).toHaveAttribute('data-goal-action', 'cleared')
  await expect(cards.nth(2)).toContainText(objective)
  await expect(summary).toContainText(nextObjective)
  await expect(page.locator('.hbar-app-react-session-footer .hbar-composer-goal-strip')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await cards.first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(output, 'history-restored-900.png') })
  // Reuse the verified disposable native fixture, never attach to the user's desktop.
  const languageOutput = resolve('artifacts/desktop-entry-matrix/language/native')
  await mkdir(languageOutput, { recursive: true })
  await prompt.fill(draft)
  const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await showSidebar.isVisible()) await showSidebar.click()
  await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
  await page.getByRole('button', { name: copy.appearance.group, exact: true }).click()
  await page.getByRole('radio', { name: copy.appearance.theme.dark, exact: true }).click()
  await expect(page.getByText(copy.appearance.unsaved, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: copy.general.group, exact: true }).click()
  const languageGeometry: unknown[] = []
  for (const languageLocale of ['en-US', 'zh-CN'] as const) {
    const currentCopy = getShellCopy(languageLocale)
    const radio = page.getByRole('radio', { name: languageLocale === 'en-US' ? 'English' : '简体中文', exact: true })
    await radio.click()
    await expect(page.locator('html')).toHaveAttribute('lang', languageLocale)
    await expect(radio).toHaveAttribute('aria-checked', 'true')
    await expect(radio).toBeFocused()
    await expect(page.getByText(currentCopy.general.saved, { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: currentCopy.general.title, exact: true })).toBeVisible()
    await expect
      .poll(() =>
        page
          .locator('.hbar-web-general-choices button')
          .evaluateAll((nodes) =>
            nodes.every((node) => node.getAnimations().every((animation) => animation.playState !== 'running')),
          ),
      )
      .toBe(true)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: join(languageOutput, `general-${languageLocale}-900.png`) })
    await page.getByRole('button', { name: currentCopy.appearance.group, exact: true }).click()
    await expect(page.getByRole('radio', { name: currentCopy.appearance.theme.dark, exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(page.getByText(currentCopy.appearance.unsaved, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: currentCopy.general.group, exact: true }).click()
    languageGeometry.push({
      locale: languageLocale,
      width: 900,
      noHorizontalOverflow: true,
      sameSettingsPage: true,
      unsavedAppearanceRetained: true,
    })
  }
  const chineseCopy = getShellCopy('zh-CN')
  await expect
    .poll(() =>
      page
        .locator('.hbar-app-react-settings-groups button[aria-current="page"]')
        .evaluate((button) =>
          button.getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running'),
        ),
    )
    .toBe(true)
  const navigationMarker = await page
    .locator('.hbar-app-react-settings-groups button[aria-current="page"]')
    .evaluate((button) => {
      const obsolete = getComputedStyle(button, '::before')
      const indicator = button.querySelector('[data-state="selected"][data-edge]')
      const beam = indicator?.firstElementChild
      const halo = beam?.firstElementChild
      return {
        obsoletePseudo: { content: obsolete.content, width: obsolete.width, shadow: obsolete.boxShadow },
        canonical:
          indicator && beam && halo
            ? {
                state: indicator.getAttribute('data-state'),
                edge: indicator.getAttribute('data-edge'),
                beamWidth: beam.getBoundingClientRect().width,
                beamHeight: beam.getBoundingClientRect().height,
                beamOpacity: getComputedStyle(beam).opacity,
                haloOpacity: getComputedStyle(halo).opacity,
                haloShadow: getComputedStyle(halo).boxShadow,
              }
            : null,
      }
    })
  expect(navigationMarker.canonical?.state).toBe('selected')
  expect(navigationMarker.canonical?.edge).toBe('right')
  expect(navigationMarker.canonical?.beamWidth).toBeGreaterThan(0)
  expect(navigationMarker.canonical?.beamHeight).toBeGreaterThan(navigationMarker.canonical?.beamWidth ?? Infinity)
  expect(Number(navigationMarker.canonical?.beamOpacity)).toBeGreaterThan(0)
  expect(Number(navigationMarker.canonical?.haloOpacity)).toBeGreaterThan(0)
  expect(navigationMarker.canonical?.haloShadow).not.toBe('none')
  await writeFile(join(languageOutput, 'navigation-marker.json'), JSON.stringify(navigationMarker, null, 2))
  await page.getByRole('button', { name: chineseCopy.settings.back, exact: true }).click()
  await expectComposerText(page.getByRole('textbox', { name: chineseCopy.session.prompt.input, exact: true }), draft)
  await expect(cards).toHaveCount(4)
  await expect(summary).toContainText(nextObjective)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(cards).toHaveCount(4)
  const showChineseSidebar = page.getByRole('button', { name: chineseCopy.shell.showSidebar, exact: true })
  if (await showChineseSidebar.isVisible()) await showChineseSidebar.click()
  await page.getByRole('button', { name: chineseCopy.shell.settings, exact: true }).click()
  await expect(page.getByRole('heading', { name: chineseCopy.general.title, exact: true })).toBeVisible()
  await expect(page.getByRole('radio', { name: '简体中文', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.screenshot({ path: join(languageOutput, 'saved-reloaded-zh-CN-900.png') })
  await writeFile(
    join(languageOutput, 'verification.json'),
    JSON.stringify(
      {
        executable,
        debugPort,
        languageGeometry,
        draftKeptBeforeReload: true,
        nativeLanguageReload: true,
        noNativeBroadcastOrOsLiveFollowClaim: true,
      },
      null,
      2,
    ),
  )
  const snapshot = await api.call('session.snapshot', { sessionId: session.id })
  expect(snapshot.runs).toEqual([])
  expect(snapshot.messages).toEqual([])
  expect((await goals.execute('goal.get', { sessionId: session.id })).goal?.goalId).toBe(nextId)
  expect(errors).toEqual([])
  await writeFile(
    join(output, 'verification.json'),
    JSON.stringify(
      {
        executable,
        locale,
        debugPort,
        sessionId: session.id,
        facts: history.items.map(({ eventId, seq, type, goal }) => ({
          eventId,
          seq,
          type,
          goalId: goal?.goalId ?? null,
        })),
        geometry,
        canonicalHistoryRestored: true,
        noRunsOrMessagesFabricated: true,
        draftRetentionScope: 'Goal transitions, disclosure and resize; reload persistence is not implemented',
        errors,
      },
      null,
      2,
    ),
  )
  console.log(
    'PASS: isolated native Goal history preserves the old objective through complete/clear/new paused Goal and reload; summary stays below header, keyboard disclosures/aria work, drafts stay unchanged before reload, and 1440/900×600 do not horizontally overflow. Device language switches in place at 900, preserves the unsaved Appearance draft and conversation, and reloads in saved Chinese. No provider Run was created.',
  )
} finally {
  api?.disconnect()
  await browser?.close().catch(() => {})
  if (child.exitCode === null) child.kill()
  await child.exited
  if (!hostIdentity || !supervisorIdentity) {
    // Startup failed before ownership was proved: leave possible Host data intact, never guess a PID.
    console.error(`Unverified startup: fixture directories retained for inspection: ${root}, ${workspacePath}`)
  } else {
    await stopCapturedProcess(supervisorIdentity)
    await stopCapturedProcess(hostIdentity)
    await cleanupNativeSessionFixture(root)
    await cleanupWorkspace()
  }
}
