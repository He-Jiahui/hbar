import { chromium, expect } from '@playwright/test'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import {
  HbarClient,
  createRunCommandClient,
  createSettingsCommandClient,
  createSystemCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { desktopStartupSchema } from '@hbar/contracts/desktop'
import { getShellCopy } from '../apps/web/src/shell-copy'
import {
  nativeSmokeFixtureRoot,
  ownsNativeSmokeHost,
  parseNativeSmokeConnection,
  waitForNativeSmokeExit,
  redactNativeSmokeDiagnostics,
} from './desktop-smoke-fixture'

if (process.platform !== 'win32') throw new Error('The native tray verification requires Windows')
const root = nativeSmokeFixtureRoot(await mkdtemp(join(tmpdir(), 'hbar-native-')))
const project = nativeSmokeFixtureRoot(await mkdtemp(join(tmpdir(), 'hbar-native-')))
const executable = resolve(process.env.HBAR_DESKTOP_EXE ?? 'target/desktop/debug/hbar-desktop.exe')
const processesSchema = z.array(z.object({ ProcessId: z.number(), ParentProcessId: z.number(), Name: z.string() }))
let child: ReturnType<typeof Bun.spawn> | undefined
let connection: (ReturnType<typeof parseNativeSmokeConnection> & { supervisorPid: number }) | undefined
let api: HbarClient | undefined
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined

async function until<Value>(operation: () => Promise<Value>, timeoutMs = 45_000): Promise<Value> {
  const started = Date.now()
  for (;;) {
    try {
      return await operation()
    } catch (error) {
      if (Date.now() - started >= timeoutMs) throw error
      await Bun.sleep(100)
    }
  }
}
async function powershell(script: string): Promise<string> {
  const process_ = Bun.spawn(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
  })
  const [output, error, code] = await Promise.all([
    new Response(process_.stdout).text(),
    new Response(process_.stderr).text(),
    process_.exited,
  ])
  if (code !== 0) throw new Error(`Native inspection failed: ${error.slice(0, 300)}`)
  return output
}
async function assertWindowless(pid: number) {
  const rows = processesSchema.parse(
    JSON.parse(
      await powershell(
        '@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name) | ConvertTo-Json -Compress',
      ),
    ),
  )
  expect(rows.some((row) => row.ProcessId === pid)).toBe(true)
  const owned = new Set([pid])
  for (let round = 0; round < 32; round++) {
    const count = owned.size
    for (const row of rows) if (owned.has(row.ParentProcessId)) owned.add(row.ProcessId)
    if (owned.size === count) break
  }
  expect(rows.filter((row) => owned.has(row.ProcessId) && row.Name.toLowerCase() === 'msedgewebview2.exe')).toEqual([])
}
async function waitForTray(pid: number, background = true) {
  const recordSchema = z.object({ event: z.string(), processId: z.number(), background: z.boolean().optional() })
  await until(async () => {
    const content = await readFile(join(root, 'settings', 'diagnostics', 'native-lifecycle.jsonl'), 'utf8')
    const records = content
      .trim()
      .split('\n')
      .flatMap((line) => {
        try {
          const parsed = recordSchema.safeParse(JSON.parse(line))
          return parsed.success ? [parsed.data] : []
        } catch {
          return []
        }
      })
    expect(
      records.some(
        (record) => record.processId === pid && record.event === 'tray_ready' && record.background === background,
      ),
    ).toBe(true)
  })
}
function launch(args: readonly string[], debugPort?: number) {
  return Bun.spawn([executable, ...args], {
    env: {
      ...process.env,
      HBAR_HOME: root,
      HBAR_DATA_ROOT: root,
      HBAR_CACHE_ROOT: join(root, 'cache'),
      HBAR_WORKSPACE: project,
      HBAR_DEMO: '1',
      HBAR_DESKTOP_DEV: '0',
      HBAR_RUNTIME_WATCH: '0',
      HBAR_PORT: '0',
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: debugPort ? `--remote-debugging-port=${debugPort}` : '',
      WEBVIEW2_USER_DATA_FOLDER: join(root, 'workbench-webview'),
    },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    windowsHide: true,
  })
}
async function readConnection() {
  const raw: unknown = JSON.parse(await readFile(join(root, 'settings', 'connection.json'), 'utf8'))
  return { ...parseNativeSmokeConnection(raw), ...z.object({ supervisorPid: z.number().int().positive() }).parse(raw) }
}

async function stopOwnedBackend(supervisorPid: number) {
  const commandLine: unknown = JSON.parse(
    (
      await powershell(
        `$ownedBackend = Get-CimInstance Win32_Process -Filter 'ProcessId = ${supervisorPid}'; if ($ownedBackend) { $ownedBackend.CommandLine | ConvertTo-Json -Compress }`,
      )
    ).trim() || 'null',
  )
  if (commandLine === null) return
  if (typeof commandLine !== 'string' || !ownsNativeSmokeHost(commandLine, root))
    throw new Error('Refusing to terminate a Host outside the owned native fixture')
  const stop = Bun.spawn(['taskkill.exe', '/PID', String(supervisorPid), '/T', '/F'], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    windowsHide: true,
  })
  if ((await stop.exited) !== 0) throw new Error('Owned backend process tree did not stop')
}

try {
  await writeFile(join(project, 'backend-proof.txt'), 'windowless backend read proof\n')
  child = launch(['--background'])
  connection = await until(readConnection)
  await waitForTray(child.pid)
  const client = new HbarClient(connection.url, connection.token)
  api = client
  await until(() => client.connect())
  await assertWindowless(child.pid)
  const settings = createSettingsCommandClient(api)
  const snapshot = await until(() => settings.execute('settings.get', { scope: { kind: 'global' } }))
  await settings.execute(
    'settings.set',
    {
      schemaVersion: snapshot.schemaVersion,
      scope: snapshot.scope,
      baselineRevisions: snapshot.revisions,
      path: [{ kind: 'field', name: 'desktop.startupMode' }],
      value: 'background',
    },
    { idempotencyKey: 'verify-background-startup' },
  )
  const response = await fetch(`${connection.url}/api/desktop/startup`, {
    headers: { Authorization: `Bearer ${connection.token}` },
  })
  expect(desktopStartupSchema.parse(await response.json()).startupMode).toBe('background')
  const originalInstance = connection.instanceId
  child.kill()
  await waitForNativeSmokeExit(child.exited)
  child = undefined
  const health = z
    .object({ instanceId: z.string(), ready: z.literal(true) })
    .parse(await (await fetch(`${connection.url}/healthz`)).json())
  expect(health.instanceId).toBe(originalInstance)
  child = launch([])
  await waitForTray(child.pid)
  await assertWindowless(child.pid)
  expect((await readConnection()).instanceId).toBe(originalInstance)
  const state = await api.call('system.bootstrap', {})
  const workspace = state.workspaces.find((item) => resolve(item.path) === resolve(project))
  if (!workspace) throw new Error('Native backend did not use its owned project')
  const session = await createWorkspaceSessionCommandClient(api).execute(
    'session.create',
    {
      workspaceId: workspace.id,
      title: 'Windowless backend proof',
    },
    { idempotencyKey: 'verify-background-session' },
  )
  const runs = createRunCommandClient(api)
  const accepted = await runs.execute(
    'run.submit',
    {
      sessionId: session.id,
      modelId: 'local-fixture',
      input: { text: '/tool read_file {"path":"backend-proof.txt"}', images: [], approval: 'deny' },
    },
    { idempotencyKey: 'verify-background-run' },
  )
  await until(async () => {
    const operation = await runs.execute('operation.get', { operationId: accepted.operationId })
    expect(operation.status).toBe('completed')
  })
  const result = await api.call('session.snapshot', { sessionId: session.id })
  expect(JSON.stringify(result.messages)).toContain('windowless backend read proof')
  const pairing = await createSystemCommandClient(api).execute('pairing.create', {
    role: 'operator',
    workspaceIds: null,
  })
  const paired = await fetch(`${connection.url}/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: pairing.code, name: 'Windowless browser fixture' }),
  })
  expect(paired.status).toBe(200)
  expect(paired.headers.get('set-cookie')).toContain('HttpOnly')
  expect((await fetch(connection.url)).status).toBe(200)
  await assertWindowless(child.pid)
  child.kill()
  await waitForNativeSmokeExit(child.exited)
  child = undefined
  const debugPort = await new Promise<number>((accept, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = probe.address()
      if (!address || typeof address === 'string') {
        probe.close(() => reject(new Error('Could not reserve a native fixture debugging port')))
        return
      }
      probe.close((error) => (error ? reject(error) : accept(address.port)))
    })
  })
  child = launch(['--client'], debugPort)
  await waitForTray(child.pid, false)
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`))
  const page = await until(async () => {
    const candidate = browser
      ?.contexts()
      .flatMap((context) => context.pages())
      .find((item) => item.url().startsWith(connection?.url ?? 'invalid:'))
    if (!candidate) throw new Error('Owned native workbench has not loaded')
    return candidate
  })
  const locale = (await page.locator('html').getAttribute('lang')) === 'en-US' ? 'en-US' : 'zh-CN'
  const close = page.getByRole('button', { name: getShellCopy(locale).windowControls.close, exact: true })
  await expect(close).toBeVisible()
  const continuing = await runs.execute(
    'run.submit',
    {
      sessionId: session.id,
      modelId: 'local-fixture',
      input: { text: '/slow continue after closing the native workbench', images: [], approval: 'deny' },
    },
    { idempotencyKey: 'verify-background-window-close' },
  )
  await until(async () =>
    expect((await runs.execute('operation.get', { operationId: continuing.operationId })).status).toBe('running'),
  )
  await close.click()
  await until(async () => expect(page.isClosed()).toBe(true))
  await until(() => assertWindowless(child?.pid ?? 0))
  expect((await readConnection()).instanceId).toBe(originalInstance)
  await until(async () =>
    expect((await runs.execute('operation.get', { operationId: continuing.operationId })).status).toBe('completed'),
  )
  browser = undefined
  await mkdir('artifacts/backend-autonomy', { recursive: true })
  await writeFile(
    'artifacts/backend-autonomy/native-windowless.json',
    JSON.stringify(
      {
        executable,
        instanceReused: true,
        explicitBackground: true,
        savedBackground: true,
        webviewProcesses: 0,
        completedRunId: accepted.operationId,
        browserPairing: true,
        windowDestroyed: true,
        runCompletedAfterWindowClose: continuing.operationId,
      },
      null,
      2,
    ),
  )
  console.log(
    'Native tray proof passed: no WebView, saved startup, shared Host, browser pairing and a Run continuing after window close.',
  )
} catch (error) {
  await mkdir('artifacts/backend-autonomy', { recursive: true })
  const hostLog = await readFile(join(root, 'diagnostics', 'desktop-host.log'), 'utf8').catch(() => '')
  await writeFile(
    'artifacts/backend-autonomy/native-windowless-failure.log',
    redactNativeSmokeDiagnostics(hostLog.slice(-64_000), connection?.token),
  )
  throw error
} finally {
  await browser?.close().catch(() => undefined)
  api?.disconnect()
  if (child) {
    child.kill()
    await waitForNativeSmokeExit(child.exited)
  }
  if (connection) await stopOwnedBackend(connection.supervisorPid)
  await rm(nativeSmokeFixtureRoot(root), { recursive: true, force: true })
  await rm(nativeSmokeFixtureRoot(project), { recursive: true, force: true })
}
