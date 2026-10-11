import { chromium, expect } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { HbarClient, createSystemCommandClient } from '@hbar/client'
import { findFreePort } from './dev-ports'
import { nativeSmokeFixtureRoot, ownsNativeSmokeHost, redactNativeSmokeDiagnostics } from './desktop-smoke-fixture'
const root = nativeSmokeFixtureRoot(await mkdtemp(join(tmpdir(), 'hbar-native-')))
const projectRoot = nativeSmokeFixtureRoot(await mkdtemp(join(tmpdir(), 'hbar-native-')))
await writeFile(join(projectRoot, 'proof.txt'), 'isolated native managed runtime\n')
const port = await findFreePort()
const child = Bun.spawn([resolve('apps/desktop/src-tauri/target/debug/hbar-desktop.exe')], {
  windowsHide: true,
  env: {
    ...process.env,
    HBAR_HOME: root,
    HBAR_WORKSPACE: projectRoot,
    HBAR_DEMO: '1',
    HBAR_DESKTOP_DEV: '',
    HBAR_WEB_DEV_URL: '',
    HBAR_RUNTIME_WATCH: '',
    WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
  stdin: 'ignore',
  stdout: 'ignore',
  stderr: 'ignore',
})
async function until<T>(read: () => Promise<T>, timeout = 60_000): Promise<T> {
  const deadline = Date.now() + timeout
  for (;;) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await Bun.sleep(100)
    }
  }
}
const connectionSchema = z.object({
  url: z.string().url(),
  token: z.string(),
  pid: z.number().int().positive(),
  supervisorPid: z.number().int().positive(),
  instanceId: z.string(),
})
let connection: z.infer<typeof connectionSchema> | undefined
let client: HbarClient | undefined
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
async function stopOwnedHost(owned: z.infer<typeof connectionSchema>): Promise<void> {
  const inspect = Bun.spawn(
    [
      'powershell',
      '-NoProfile',
      '-Command',
      `Get-CimInstance Win32_Process -Filter 'ProcessId = ${owned.supervisorPid}' | Select-Object -ExpandProperty CommandLine | ConvertTo-Json -Compress`,
    ],
    { windowsHide: true, stdout: 'pipe', stderr: 'ignore', stdin: 'ignore' },
  )
  const raw = await new Response(inspect.stdout).text()
  if (await inspect.exited) throw new Error('Could not verify fixture Supervisor')
  if (raw.trim()) {
    const command = z.string().parse(JSON.parse(raw))
    if (!ownsNativeSmokeHost(command, root)) throw new Error('Fixture Supervisor ownership mismatch')
    process.kill(owned.supervisorPid)
  }
  await until(async () => {
    try {
      process.kill(owned.pid, 0)
    } catch {
      return true
    }
    throw new Error('Fixture Host has not exited')
  }, 15_000)
}
try {
  connection = await until(async () =>
    connectionSchema.parse(JSON.parse(await readFile(join(root, 'settings/connection.json'), 'utf8'))),
  )
  client = new HbarClient(connection.url, connection.token)
  await client.connect()
  const system = createSystemCommandClient(client)
  const before = await until(async () => {
    const state = await system.execute('system.runtime.get', {})
    if (!state.ready) throw new Error('Managed units are preparing')
    return state
  })
  expect(before.ready).toBe(true)
  expect(before.units).toHaveLength(14)
  const ownedPids = [
    connection.pid,
    connection.supervisorPid,
    ...before.units.flatMap((unit) =>
      unit.generations.flatMap((generation) => (generation.pid ? [generation.pid] : [])),
    ),
  ]
  const sampler = Bun.spawn(
    [
      'powershell.exe',
      '-NoProfile',
      '-Command',
      `@(Get-Process -Id ${ownedPids.join(',')} | Select-Object Id, ProcessName, WorkingSet64) | ConvertTo-Json -Compress`,
    ],
    { windowsHide: true, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
  )
  const processes = z
    .array(z.object({ Id: z.number(), ProcessName: z.string(), WorkingSet64: z.number() }))
    .parse(JSON.parse(await new Response(sampler.stdout).text()))
  expect(await sampler.exited).toBe(0)
  expect(processes).toHaveLength(16)
  expect(processes.every((process) => process.ProcessName.toLowerCase() === 'bun')).toBe(true)
  browser = await until(() => chromium.connectOverCDP(`http://127.0.0.1:${port}`))
  const page = await until(async () => {
    const page = browser?.contexts()[0]?.pages()[0]
    if (!page) throw new Error('Native page unavailable')
    return page
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.locator('[data-lumen-shell="app"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('footer').getByText(/^(已连接|Connected)$/)).toBeVisible({ timeout: 30_000 })
  const kernel = before.units.find((unit) => unit.descriptor.id === 'kernel')!.generations[0]!
  if (!kernel.pid || kernel.pid === process.pid || kernel.pid === child.pid)
    throw new Error('Fixture Kernel PID invalid')
  process.kill(kernel.pid, 'SIGKILL')
  const after = await until(async () => {
    const state = await system.execute('system.runtime.get', {})
    const current = state.units.find((unit) => unit.descriptor.id === 'kernel')?.generations[0]
    if (!state.ready || current?.incarnation === kernel.incarnation) throw new Error('Kernel is recovering')
    return state
  })
  const currentConnection = connectionSchema.parse(
    JSON.parse(await readFile(join(root, 'settings/connection.json'), 'utf8')),
  )
  expect(currentConnection).toEqual(connection)
  expect(after.instanceId).toBe(before.instanceId)
  expect(client.connectionStatus()).toBe('connected')
  for (const unit of before.units.filter((unit) => unit.descriptor.id !== 'kernel'))
    expect(after.units.find((current) => current.descriptor.id === unit.descriptor.id)?.generations[0]?.pid).toBe(
      unit.generations[0]?.pid,
    )
  expect(errors).toEqual([])
  await mkdir('artifacts/runtime-native-smoke', { recursive: true })
  await page.screenshot({ path: 'artifacts/runtime-native-smoke/managed-recovery.png' })
  await writeFile(
    'artifacts/runtime-native-smoke/result.json',
    JSON.stringify(
      {
        passed: true,
        nativePid: child.pid,
        hostPid: connection.pid,
        isolatedUnits: 14,
        steadyBunProcesses: processes.length,
        workingSetBytes: processes.reduce((sum, process) => sum + process.WorkingSet64, 0),
        kernelRecovered: true,
        identityPreserved: true,
        websocketPreserved: true,
        errors,
      },
      null,
      2,
    ),
  )
  console.log(
    'PASS: isolated desktop WebView and 14 managed units, Kernel fault recovery, stable identity/credentials/socket, no page errors.',
  )
} catch (error) {
  const diagnostic = await readFile(join(root, 'diagnostics/desktop-host.log'), 'utf8').catch(() => '')
  console.error(redactNativeSmokeDiagnostics(diagnostic, connection?.token))
  throw error
} finally {
  client?.disconnect()
  await browser?.close().catch(() => {})
  if (child.exitCode === null) child.kill()
  await child.exited
  if (connection) await stopOwnedHost(connection)
  for (const directory of [root, projectRoot])
    await rm(nativeSmokeFixtureRoot(directory), { recursive: true, force: true, maxRetries: 40, retryDelay: 250 })
}
