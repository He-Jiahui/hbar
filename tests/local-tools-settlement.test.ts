import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalExecution } from '@hbar/local-tools'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

test('shell settles after a direct timeout when a detached descendant retains output pipes', async () => {
  if (process.platform !== 'win32') return
  const root = await mkdtemp(join(tmpdir(), 'hbar-local-settlement-'))
  roots.push(root)
  const pidFile = join(root, 'descendant.pid')
  const outputFile = join(root, 'descendant.out')
  const errorFile = join(root, 'descendant.err')
  const execution = new LocalExecution()
  const started = Date.now()
  let descendantPid: number | undefined
  try {
    const result = await execution.exec(
      root,
      `Start-Process powershell.exe -ArgumentList '-NoProfile','-Command','Start-Sleep -Seconds 30' -WorkingDirectory '${root}' -RedirectStandardOutput '${outputFile}' -RedirectStandardError '${errorFile}' -PassThru | Select-Object -ExpandProperty Id | Set-Content -LiteralPath '${pidFile}'; Write-Output parent; Start-Sleep -Seconds 30`,
      new AbortController().signal,
      { timeoutMs: 1_000 },
    )
    expect(Date.now() - started).toBeLessThan(5_000)
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
    if (Number.isInteger(descendantPid)) {
      const cleanup = Bun.spawn(['taskkill.exe', '/PID', String(descendantPid), '/T', '/F'], {
        stdout: 'ignore',
        stderr: 'ignore',
        windowsHide: true,
      })
      await cleanup.exited
    }
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
  const execution = new LocalExecution()
  const started = Date.now()
  try {
    const result = await execution.exec(
      root,
      `Start-Process powershell.exe -ArgumentList '-NoProfile','-Command','Start-Sleep -Seconds 30' -WorkingDirectory '${root}' -RedirectStandardOutput '${outputFile}' -RedirectStandardError '${errorFile}' -PassThru | Select-Object -ExpandProperty Id | Set-Content -LiteralPath '${pidFile}'; Write-Output parent`,
      new AbortController().signal,
      { timeoutMs: 5_000 },
    )
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(result).toMatchObject({ isError: false, details: { code: 0, drainCutoff: true } })
    expect(result.text).toContain('parent')
  } finally {
    const pid = Number.parseInt(await readFile(pidFile, 'utf8').catch(() => ''), 10)
    if (Number.isInteger(pid)) {
      const cleanup = Bun.spawn(['taskkill.exe', '/PID', String(pid), '/T', '/F'], {
        stdout: 'ignore',
        stderr: 'ignore',
        windowsHide: true,
      })
      await cleanup.exited
    }
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
