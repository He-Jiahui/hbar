import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { LocalExecution } from '@hbar/local-tools'

const roots: string[] = []

type ProcessQuery = { commandLine?: string; timedOut: boolean }

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function processCommandLine(pid: number, timeoutMs = 3_000): Promise<ProcessQuery> {
  const probe = Bun.spawn(
    [
      'powershell.exe',
      '-NoProfile',
      '-Command',
      `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($p) { $p.CommandLine }`,
    ],
    {
      stdout: 'pipe',
      stderr: 'ignore',
      windowsHide: true,
    },
  )
  const output = new Response(probe.stdout).text()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const completed = await Promise.race([
      Promise.all([output, probe.exited]).then(([text]) => ({ text, timedOut: false })),
      new Promise<{ text: string; timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ text: '', timedOut: true }), timeoutMs)
      }),
    ])
    if (completed.timedOut) {
      probe.kill()
      await Promise.race([probe.exited, delay(250)])
      return { timedOut: true }
    }
    const commandLine = completed.text.trim()
    return commandLine ? { commandLine, timedOut: false } : { timedOut: false }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function waitForExit(child: Bun.Subprocess, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      child.exited.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function stopOwnedPowerShell(pidFile: string, scriptPath: string, root: string): Promise<void> {
  const rawPid = (await readFile(pidFile, 'utf8').catch(() => '')).trim()
  const pid = /^\d+$/.test(rawPid) ? Number(rawPid) : NaN
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return

  // Confirm the recorded PID still runs this test's exact script from its
  // fixture root before terminating it. A name-only check could kill an
  // unrelated PowerShell process after PID reuse.
  const queriedProcess = await processCommandLine(pid)
  if (queriedProcess.timedOut) throw new Error(`timed out verifying fixture child PID ${pid}`)
  const commandLine = queriedProcess.commandLine
  const expectedScript = scriptPath.toLowerCase()
  const expectedRoot = root.toLowerCase()
  if (!commandLine?.toLowerCase().includes(expectedScript) || !commandLine.toLowerCase().includes(expectedRoot)) return
  const cleanup = Bun.spawn(['taskkill.exe', '/PID', String(pid), '/F'], {
    stdout: 'ignore',
    stderr: 'ignore',
    windowsHide: true,
  })
  if (!(await waitForExit(cleanup, 3_000))) {
    cleanup.kill()
    await Promise.race([cleanup.exited, delay(250)])
    throw new Error(`timed out stopping fixture child PID ${pid}`)
  }
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    const current = await processCommandLine(pid, Math.min(3_000, Math.max(1, deadline - Date.now())))
    if (!current.timedOut && !current.commandLine) return
    await delay(50)
  }
  throw new Error(`fixture child PID ${pid} remained after bounded cleanup`)
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    const temp = await realpath(tmpdir())
    const parent = await realpath(dirname(root))
    const name = basename(root)
    if (
      parent !== temp ||
      !['hbar-local-settlement-', 'hbar-local-eof-', 'hbar-local-output-'].some((prefix) => name.startsWith(prefix))
    )
      throw new Error(`refusing to remove unexpected fixture path: ${root}`)
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})

test('shell settles after a direct timeout when a detached descendant retains output pipes', async () => {
  if (process.platform !== 'win32') return
  const root = await mkdtemp(join(tmpdir(), 'hbar-local-settlement-'))
  roots.push(root)
  const pidFile = join(root, 'descendant.pid')
  const scriptPath = join(root, 'descendant.ps1')
  await writeFile(scriptPath, 'Start-Sleep -Seconds 30\n', 'utf8')
  const outputFile = join(root, 'descendant.out')
  const errorFile = join(root, 'descendant.err')
  const execution = new LocalExecution()
  const started = Date.now()
  let descendantPid: number | undefined
  try {
    const result = await execution.exec(
      root,
      `Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile','-File','${scriptPath}','--fixture-root','${root}' -WorkingDirectory '${root}' -RedirectStandardOutput '${outputFile}' -RedirectStandardError '${errorFile}' -PassThru | Select-Object -ExpandProperty Id | Set-Content -LiteralPath '${pidFile}'; Write-Output parent; Start-Sleep -Seconds 30`,
      new AbortController().signal,
      // Leave enough time for Start-Process to publish the PID handshake on
      // slower Windows runners; the command still exceeds this bound and
      // exercises direct-child timeout settlement.
      { timeoutMs: 3_000 },
    )
    expect(Date.now() - started).toBeLessThan(7_000)
    expect(result).toMatchObject({ isError: true, details: { code: 'TOOL_TIMEOUT' } })
    descendantPid = Number.parseInt(await readFile(pidFile, 'utf8'), 10)
    expect(Number.isInteger(descendantPid)).toBe(true)
    const next = await execution.exec(root, 'Write-Output settled', new AbortController().signal, { timeoutMs: 2_000 })
    expect(next).toMatchObject({ isError: false })
    expect(next.text).toContain('settled')
  } finally {
    if (descendantPid === undefined) {
      descendantPid = Number.parseInt(await readFile(pidFile, 'utf8').catch(() => ''), 10)
    }
    if (Number.isInteger(descendantPid)) await stopOwnedPowerShell(pidFile, scriptPath, root)
    execution.dispose()
  }
})

test('shell returns after the parent exits even when a detached child keeps the pipes open', async () => {
  if (process.platform !== 'win32') return
  const root = await mkdtemp(join(tmpdir(), 'hbar-local-eof-'))
  roots.push(root)
  const outputFile = join(root, 'descendant.out')
  const errorFile = join(root, 'descendant.err')
  const pidFile = join(root, 'descendant.pid')
  const scriptPath = join(root, 'descendant.ps1')
  await writeFile(scriptPath, 'Start-Sleep -Seconds 30\n', 'utf8')
  const execution = new LocalExecution()
  const started = Date.now()
  try {
    const result = await execution.exec(
      root,
      `Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile','-File','${scriptPath}','--fixture-root','${root}' -WorkingDirectory '${root}' -RedirectStandardOutput '${outputFile}' -RedirectStandardError '${errorFile}' -PassThru | Select-Object -ExpandProperty Id | Set-Content -LiteralPath '${pidFile}'; Write-Output parent`,
      new AbortController().signal,
      { timeoutMs: 5_000 },
    )
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(result).toMatchObject({ isError: false, details: { code: 0, drainCutoff: true } })
    expect(result.text).toContain('parent')
  } finally {
    await stopOwnedPowerShell(pidFile, scriptPath, root)
    execution.dispose()
  }
})

test('shell drains normal stdout and stderr before the direct process exits', async () => {
  if (process.platform !== 'win32') return
  const root = await mkdtemp(join(tmpdir(), 'hbar-local-output-'))
  roots.push(root)
  const execution = new LocalExecution()
  try {
    const result = await execution.exec(
      root,
      "Write-Output ('o' * 50000); [Console]::Error.WriteLine('e' * 50000)",
      new AbortController().signal,
      { timeoutMs: 5_000 },
    )
    expect(result).toMatchObject({ isError: false, details: { truncated: false, drainCutoff: false } })
    expect(result.text).toContain('o'.repeat(50_000))
    expect(result.text).toContain('e'.repeat(50_000))
  } finally {
    execution.dispose()
  }
})
