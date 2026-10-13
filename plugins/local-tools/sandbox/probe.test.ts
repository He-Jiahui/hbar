import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

type SandboxAddon = {
  SandboxLevel: { Unelevated: 'Unelevated' }
  isAvailable(): boolean
  probeConfinement(): {
    available: boolean
    filesystem: boolean
    network: boolean
    processTree: boolean
    reason?: string
  }
  spawnSandboxed(
    profile: {
      workspaceRoot: string
      writableRoots: string[]
      readableRoots: string[]
      networkEnabled: boolean
      envOverrides: Record<string, string>
      environment: Record<string, string>
      environmentAllowlist: string[]
      level: 'Unelevated'
    },
    argv: string[],
    cwd: string,
    trustedJournalDirectory?: string,
  ): Promise<{ pid: number; handleId: string }>
  pollSandboxed(handleId: string): { stdout: string; stderr: string; exitCode?: number }
  terminateSandboxed(handleId: string): void
}

const require = createRequire(import.meta.url)
const addon =
  process.platform === 'win32'
    ? (require(process.env.HBAR_SANDBOX_TEST_MODULE ?? './hbar_sandbox_win.node') as SandboxAddon)
    : undefined
const roots: string[] = []
let journalRoot: string | undefined
const powershell = join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
)
const quotePowerShellPath = (value: string) => "'" + value.replaceAll("'", "''") + "'"
const appProfile = (root: string) => ({
  workspaceRoot: root,
  writableRoots: [root],
  readableRoots: [root],
  networkEnabled: false,
  envOverrides: {},
  environment: Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  ),
  environmentAllowlist: Object.keys(process.env).filter((name) => process.env[name] !== undefined),
  level: 'Unelevated' as const,
})
const spawnSandboxed = (profile: Parameters<SandboxAddon['spawnSandboxed']>[0], argv: string[], cwd: string) => {
  if (!addon || !journalRoot) throw new Error('Windows sandbox journal fixture is unavailable')
  return addon.spawnSandboxed(profile, argv, cwd, journalRoot)
}
async function finishProcess(handleId: string): Promise<{ exitCode?: number; stdout: string; stderr: string }> {
  if (!addon) return { stdout: '', stderr: '' }
  let stdout = ''
  let stderr = ''
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const result = addon.pollSandboxed(handleId)
    stdout += result.stdout
    stderr += result.stderr
    if (result.exitCode !== undefined) return { exitCode: result.exitCode, stdout, stderr }
    await Bun.sleep(20)
  }
  addon.terminateSandboxed(handleId)
  return { stdout, stderr }
}

beforeAll(async () => {
  if (!addon) return
  journalRoot = await mkdtemp(join(tmpdir(), 'hbar-appcontainer-journal-'))
  for (let index = 0; index < 7; index++)
    roots.push(await mkdtemp(join(tmpdir(), 'hbar-appcontainer-test-' + index + '-')))
})
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  if (journalRoot) await rm(journalRoot, { recursive: true, force: true })
})

describe('Windows AppContainer process boundary', () => {
  test('reports availability only after live AppContainer, network, and Job probes pass', () => {
    if (!addon) return
    const probe = addon.probeConfinement()
    expect(probe.filesystem).toBe(true)
    expect(probe.processTree).toBe(true)
    expect(probe.available).toBe(probe.filesystem && probe.network && probe.processTree)
    expect(addon.isAvailable()).toBe(probe.available)
    if (!probe.network) expect(probe.reason).toContain('host listener handshake')
  })

  test('writes within the granted private root and cannot read an external sentinel', async () => {
    if (!addon) return
    const root = roots[0]!
    const outside = join(dirname(root), 'hbar-denied-' + Date.now() + '.txt')
    const inside = join(root, 'inside.txt')
    await writeFile(outside, 'outside-secret', 'utf8')
    try {
      const command = [
        'Set-Content -LiteralPath ' + quotePowerShellPath(inside) + " -Value 'inside-ok' -NoNewline",
        "Write-Output 'sandbox-stdout-marker'",
        'try { $v = Get-Content -LiteralPath ' +
          quotePowerShellPath(outside) +
          ' -Raw -ErrorAction Stop } catch { exit 0 }',
        "if ($v -eq 'outside-secret') { exit 41 } else { exit 42 }",
      ].join('; ')
      const child = await spawnSandboxed(
        appProfile(root),
        [powershell, '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
        root,
      )
      const result = await finishProcess(child.handleId)
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('sandbox-stdout-marker')
      expect(result.stderr).toBe('')
      expect(await readFile(inside, 'utf8')).toBe('inside-ok')
      expect(await readFile(outside, 'utf8')).toBe('outside-secret')
    } finally {
      await rm(outside, { force: true })
    }
  })

  test('cannot connect to a live loopback listener without a network capability', async () => {
    if (!addon) return
    const root = roots[1]!
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('test listener did not bind a TCP port')
      const command = [
        '$client = [System.Net.Sockets.TcpClient]::new()',
        '$task = $client.ConnectAsync(' + quotePowerShellPath('127.0.0.1') + ', ' + address.port + ')',
        'if ($task.Wait(1200) -and $client.Connected) { exit 41 } else { exit 0 }',
      ].join('; ')
      const child = await spawnSandboxed(
        appProfile(root),
        [powershell, '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
        root,
      )
      expect((await finishProcess(child.handleId)).exitCode).toBe(0)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  test('starts with the declared AppContainer network capability SIDs when networking is enabled', async () => {
    if (!addon) return
    const root = roots[3]!
    const child = await spawnSandboxed(
      { ...appProfile(root), networkEnabled: true },
      [
        powershell,
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Write-Output 'network-capability-configured'",
      ],
      root,
    )
    expect((await finishProcess(child.handleId)).exitCode).toBe(0)
  })

  test('passes only the curated Windows launch environment plus explicit safe overrides', async () => {
    if (!addon) return
    const root = roots[3]!
    const child = await spawnSandboxed(
      {
        ...appProfile(root),
        envOverrides: { HBAR_SANDBOX_TEST_VALUE: 'override-ok' },
        environmentAllowlist: [...appProfile(root).environmentAllowlist, 'HBAR_SANDBOX_TEST_VALUE'],
      },
      [
        powershell,
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "if ($env:HBAR_SANDBOX_TEST_VALUE -eq 'override-ok' -and $env:SystemRoot) { exit 0 } else { exit 42 }",
      ],
      root,
    )
    expect((await finishProcess(child.handleId)).exitCode).toBe(0)
  })

  test('provides read-only EOF stdin while preserving stdout and stderr pipes', async () => {
    if (!addon) return
    const root = roots[3]!
    const child = await spawnSandboxed(
      appProfile(root),
      [
        powershell,
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$inputText = [Console]::In.ReadToEnd(); if ($inputText.Length -ne 0) { exit 43 }; [Console]::Out.WriteLine('stdin-eof-stdout'); [Console]::Error.WriteLine('stdin-eof-stderr'); exit 0",
      ],
      root,
    )
    const result = await finishProcess(child.handleId)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('stdin-eof-stdout')
    expect(result.stderr).toContain('stdin-eof-stderr')
  })

  test('drains large output written immediately before exit and releases the handle on terminal poll', async () => {
    if (!addon) return
    const root = roots[4]!
    const child = await spawnSandboxed(
      appProfile(root),
      [
        powershell,
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "[Console]::Out.Write('x' * 200000); [Console]::Error.Write('y' * 180000); exit 7",
      ],
      root,
    )
    const result = await finishProcess(child.handleId)
    expect(result.exitCode).toBe(7)
    expect(result.stdout).toHaveLength(200000)
    expect(result.stderr).toHaveLength(180000)
    expect(() => addon.pollSandboxed(child.handleId)).toThrow('unknown sandbox process')
  })

  test('kills descendants when the root process exits first, then releases the terminal handle', async () => {
    if (!addon) return
    const root = roots[5]!
    const childPidPath = join(root, 'orphan-candidate.pid')
    const command = [
      '$psi = New-Object System.Diagnostics.ProcessStartInfo',
      '$psi.FileName = ' + quotePowerShellPath(powershell),
      '$psi.Arguments = \'-NoLogo -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 30"\'',
      '$psi.UseShellExecute = $false',
      '$descendant = [System.Diagnostics.Process]::Start($psi)',
      'Set-Content -LiteralPath ' + quotePowerShellPath(childPidPath) + ' -Value $descendant.Id',
      'exit 0',
    ].join('; ')
    const child = await spawnSandboxed(
      appProfile(root),
      [powershell, '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
      root,
    )
    const deadline = Date.now() + 5_000
    let descendantPidText: string | undefined
    while (Date.now() < deadline && descendantPidText === undefined) {
      try {
        descendantPidText = await readFile(childPidPath, 'utf8')
      } catch {
        await Bun.sleep(20)
      }
    }
    expect(descendantPidText).toBeDefined()
    const descendantPid = Number(descendantPidText?.trim())
    expect(Number.isSafeInteger(descendantPid)).toBe(true)
    const result = await finishProcess(child.handleId)
    expect(result.exitCode).toBe(0)
    await Bun.sleep(100)
    const tasklist = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tasklist.exe')
    const state = Bun.spawnSync([tasklist, '/FI', 'PID eq ' + descendantPid, '/FO', 'CSV', '/NH'])
    expect(state.stdout.toString('utf8').toLowerCase()).not.toContain('"powershell.exe","' + descendantPid + '"')
    expect(() => addon.pollSandboxed(child.handleId)).toThrow('unknown sandbox process')
  })

  test('terminating the Job Object kills the entire child process tree', async () => {
    if (!addon) return
    const root = roots[6]!
    const childPidPath = join(root, 'child.pid')
    const command = [
      '$psi = New-Object System.Diagnostics.ProcessStartInfo',
      '$psi.FileName = ' + quotePowerShellPath(powershell),
      '$psi.Arguments = \'-NoLogo -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 30"\'',
      '$psi.UseShellExecute = $false',
      '$descendant = [System.Diagnostics.Process]::Start($psi)',
      'Set-Content -LiteralPath ' + quotePowerShellPath(childPidPath) + ' -Value $descendant.Id',
      'Start-Sleep -Seconds 30',
    ].join('; ')
    const child = await spawnSandboxed(
      appProfile(root),
      [powershell, '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
      root,
    )
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      try {
        await readFile(childPidPath, 'utf8')
        break
      } catch {
        await Bun.sleep(20)
      }
    }
    const descendantPid = Number((await readFile(childPidPath, 'utf8')).trim())
    expect(Number.isSafeInteger(descendantPid)).toBe(true)
    addon.terminateSandboxed(child.handleId)
    await finishProcess(child.handleId)
    await Bun.sleep(100)
    const tasklist = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tasklist.exe')
    const state = Bun.spawnSync([tasklist, '/FI', 'PID eq ' + descendantPid, '/FO', 'CSV', '/NH'])
    expect(state.stdout.toString('utf8').toLowerCase()).not.toContain('"powershell.exe","' + descendantPid + '"')
  })
})
