import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diagnosticEventSchema } from '@hbar/contracts'
import { createHostRuntimeDiagnostics } from '../apps/host/src/runtime-diagnostics.ts'

const roots: string[] = []

afterEach(async () => {
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true })
})

async function boundedExit(child: ReturnType<typeof Bun.spawn>, timeoutMs = 5_000): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      child.exited,
      new Promise<number>((resolve) => {
        timer = setTimeout(() => resolve(-1), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function stopOwnedChild(child: ReturnType<typeof Bun.spawn>): Promise<number> {
  if (child.exitCode === null) child.kill()
  return boundedExit(child, 3_000)
}

test('fatal observer writes fixed metadata and can be released without consuming the exception', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-fatal-observer-'))
  roots.push(root)
  const runtime = createHostRuntimeDiagnostics({ root, enabled: true, fullCoverage: true })
  try {
    runtime.installFatalObserver('kernel')
    process.emit('uncaughtExceptionMonitor', new Error('private-failure'), 'uncaughtException')
    process.emit('uncaughtExceptionMonitor', new Error('second-private-failure'), 'uncaughtException')
    runtime.closeFatalObserver()
    process.emit('uncaughtExceptionMonitor', new Error('after-close'), 'uncaughtException')
    await runtime.close()
    const fallback = await readFile(join(root, 'hbar-host-fatal-fallback.jsonl'), 'utf8')
    const journal = await readFile(runtime.filePath, 'utf8')
    expect(fallback).toContain('host.uncaught_exception')
    expect(fallback).toContain('HOST_UNCAUGHT_EXCEPTION')
    expect(fallback).toContain('"phase":"kernel"')
    expect(fallback.trim().split('\n')).toHaveLength(1)
    expect(fallback).not.toContain('private-failure')
    expect(fallback).not.toContain('after-close')
    expect(journal).toContain('host.uncaught_exception')
    expect(journal).not.toContain('private-failure')
  } finally {
    runtime.closeFatalObserver()
    await runtime.close().catch(() => undefined)
  }
})

test('fatal observer preserves a real child fatal exit and writes only safe fallback metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-fatal-child-'))
  roots.push(root)
  const child = Bun.spawn([process.execPath, 'tests/fixtures/host-fatal-observer-child.ts', root], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    windowsHide: true,
  })
  try {
    const exit = await boundedExit(child)
    if (exit === -1) await stopOwnedChild(child)
    expect(exit).toBe(1)
    const text = await readFile(join(root, 'hbar-host-fatal-fallback.jsonl'), 'utf8')
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(2 * 1024)
    const fallback = diagnosticEventSchema.parse(JSON.parse(text.trim()))
    expect(fallback).toMatchObject({
      event: 'host.uncaught_exception',
      phase: 'running',
      errorCode: 'HOST_UNCAUGHT_EXCEPTION',
      workerState: 'failed',
    })
    expect(fallback.processId).toBe(child.pid)
    expect(fallback).not.toHaveProperty('message')
    expect(fallback).not.toHaveProperty('stack')
    expect(fallback).not.toHaveProperty('payload')
  } finally {
    await stopOwnedChild(child)
  }
})

test('an unavailable fallback path does not change a real child fatal exit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-fatal-unwritable-'))
  roots.push(root)
  const blocked = join(root, 'blocked')
  await writeFile(blocked, 'occupied', { mode: 0o600 })
  const child = Bun.spawn([process.execPath, 'tests/fixtures/host-fatal-observer-child.ts', blocked], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    windowsHide: true,
  })
  try {
    const exit = await boundedExit(child)
    if (exit === -1) await stopOwnedChild(child)
    expect(exit).toBe(1)
  } finally {
    await stopOwnedChild(child)
  }
})
