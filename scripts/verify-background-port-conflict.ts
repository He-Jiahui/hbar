import { expect } from '@playwright/test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { nativeSmokeFixtureRoot, ownsNativeSmokeHost, waitForNativeSmokeExit } from './desktop-smoke-fixture'

if (process.platform !== 'win32') throw new Error('Native port conflict verification requires Windows')
const root = nativeSmokeFixtureRoot(await mkdtemp(join(tmpdir(), 'hbar-native-')))
const occupied = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('owned port reservation') })
const executable = resolve(process.env.HBAR_DESKTOP_EXE ?? 'target/desktop/debug/hbar-desktop.exe')
const child = Bun.spawn([executable, '--background'], {
  env: {
    ...process.env,
    HBAR_HOME: root,
    HBAR_DATA_ROOT: root,
    HBAR_CACHE_ROOT: join(root, 'cache'),
    HBAR_WORKSPACE: root,
    HBAR_PORT: String(occupied.port),
    HBAR_DEMO: '1',
    HBAR_DESKTOP_DEV: '0',
    HBAR_RUNTIME_WATCH: '0',
  },
  stdin: 'ignore',
  stdout: 'ignore',
  stderr: 'ignore',
  windowsHide: true,
})
let supervisorPid: number | undefined
let nativeExited = false
async function processCommand(pid: number): Promise<string | null> {
  const inspection = Bun.spawn(
    [
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$fixtureOwner = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($fixtureOwner) { $fixtureOwner.CommandLine | ConvertTo-Json -Compress } else { 'null' }`,
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', windowsHide: true },
  )
  const [code, output, error] = await Promise.all([
    inspection.exited,
    new Response(inspection.stdout).text(),
    new Response(inspection.stderr).text(),
  ])
  if (code !== 0) throw new Error(`Owned process inspection failed: ${error.slice(0, 200)}`)
  return z.string().nullable().parse(JSON.parse(output))
}
async function stopOwnedSupervisor(pid: number) {
  const command = await processCommand(pid)
  if (command === null) return
  if (!ownsNativeSmokeHost(command, root)) throw new Error('Refusing to stop an unowned conflict fixture process')
  const stopping = Bun.spawn(['taskkill.exe', '/PID', String(pid), '/T', '/F'], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    windowsHide: true,
  })
  await stopping.exited
}
try {
  const deadline = Date.now() + 15_000
  while (supervisorPid === undefined) {
    const records = await readFile(join(root, 'settings', 'diagnostics', 'native-lifecycle.jsonl'), 'utf8').catch(
      () => '',
    )
    for (const line of records.trim().split('\n').filter(Boolean)) {
      const record = z
        .object({ event: z.string(), processId: z.number(), childPid: z.number().optional() })
        .parse(JSON.parse(line))
      if (record.event === 'host_child_spawned' && record.processId === child.pid) supervisorPid = record.childPid
    }
    if (Date.now() >= deadline) throw new Error('Native launcher did not record its owned Supervisor')
    if (supervisorPid === undefined) await Bun.sleep(100)
  }
  const command = await processCommand(supervisorPid)
  if (!command || !ownsNativeSmokeHost(command, root))
    throw new Error('Native conflict test does not own the launched service')
  const code = await waitForNativeSmokeExit(child.exited, 45_000)
  nativeExited = true
  expect(code).not.toBe(0)
  expect(await processCommand(supervisorPid)).toBeNull()
  expect(await readFile(join(root, 'diagnostics', 'desktop-host.log'), 'utf8')).toContain('EADDRINUSE')
  expect(await (await fetch(`http://127.0.0.1:${occupied.port}`)).text()).toBe('owned port reservation')
  await mkdir('artifacts/backend-autonomy', { recursive: true })
  await writeFile(
    'artifacts/backend-autonomy/native-port-conflict.json',
    JSON.stringify(
      {
        executable,
        conflictReported: true,
        startupOwnerReleased: true,
        occupiedListenerPreserved: true,
      },
      null,
      2,
    ),
  )
  console.log(
    'Native port conflict proof passed: startup failure is reported, its Supervisor exits and the existing listener remains.',
  )
} finally {
  await occupied.stop(true)
  if (!nativeExited) {
    child.kill()
    await waitForNativeSmokeExit(child.exited)
  }
  if (supervisorPid !== undefined) await stopOwnedSupervisor(supervisorPid)
  await rm(nativeSmokeFixtureRoot(root), { recursive: true, force: true })
}
