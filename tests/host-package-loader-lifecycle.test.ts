import { expect, test } from 'bun:test'
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createPathLayout } from '@hbar/storage'
import { acquireProcessLease, processIsAlive } from '@hbar/runtime'
import { z } from 'zod'
import { FAILURE_EXIT_CODE } from '../apps/host/src/process-shutdown'

async function boundedOutput(stream: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > limit) throw new Error('LOADER_LIFECYCLE_OUTPUT_LIMIT')
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel()
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

test('real runHost async package rejection releases ownership before runtime/service startup', async () => {
  const artifactRoot = resolve(import.meta.dir, '../artifacts/host-loader-lifecycle')
  await mkdir(artifactRoot, { recursive: true })
  const root = await mkdtemp(join(artifactRoot, 'fixture-'))
  const data = join(root, 'data'),
    cache = join(root, 'cache')
  const layout = createPathLayout(data, cache, join(root, 'private-paths.json'))
  const entry = join(root, 'caller.ts')
  const loaderMarker = join(root, 'loader-entered.json')
  const openMarker = join(root, 'runtime-open-called')
  const canary = `private-loader-payload-${crypto.randomUUID()}:${'private-token-payload '.repeat(256)}`
  const hostPath = resolve(import.meta.dir, '../apps/host/src/main.ts').replaceAll('\\', '/')
  const runtimePath = resolve(import.meta.dir, '../apps/host/src/process-host-runtime.ts').replaceAll('\\', '/')
  // This caller imports actual production runHost. The tripwire does not implement Host behavior:
  // it prevents unintended runtime fanout if the required ordering regresses and records that error.
  await writeFile(
    entry,
    [
      `import { runHost } from ${JSON.stringify(hostPath)};`,
      `import { ProcessHostRuntime } from ${JSON.stringify(runtimePath)};`,
      "import { readFile, writeFile } from 'node:fs/promises';",
      "import { z } from 'zod';",
      'ProcessHostRuntime.open = async () => {',
      `  await writeFile(${JSON.stringify(openMarker)}, 'OPEN_BEFORE_LOADER');`,
      "  throw new Error('RUNTIME_OPEN_ORDER_VIOLATION');",
      '};',
      'await runHost(',
      `  ['--supervised', '--demo', '--data-root', ${JSON.stringify(data)}, '--cache-root', ${JSON.stringify(cache)}, '--port', '0'],`,
      '  [process.execPath, import.meta.path],',
      '  [process.execPath, import.meta.path],',
      '  async () => {',
      `    const owner = z.object({ pid: z.number().int().positive() }).parse(JSON.parse(await readFile(${JSON.stringify(layout.hostLock)}, 'utf8')));`,
      "    if (owner.pid !== process.pid) throw new Error('LOADER_OWNER_MISMATCH');",
      `    await writeFile(${JSON.stringify(loaderMarker)}, JSON.stringify({stage:'loader-entered', pid:process.pid, lockOwnerPid:owner.pid}));`,
      `    throw new Error(${JSON.stringify(canary)});`,
      '  },',
      ');',
    ].join('\n'),
  )
  // Strip inherited HBAR controls so the explicit private roots cannot join a user/Desktop owner.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('HBAR_')))
  const child = Bun.spawn([process.execPath, entry], {
    cwd: root,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
    env: { ...env, NODE_ENV: 'development', HBAR_DIAGNOSTICS: '1', HBAR_DIAGNOSTICS_FULL: '1' },
  })
  let timedOut = false
  const deadline = setTimeout(() => {
    timedOut = true
    child.kill()
  }, 15_000)
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      boundedOutput(child.stdout, 8 * 1024),
      boundedOutput(child.stderr, 8 * 1024),
    ])
    expect(timedOut).toBe(false)
    expect(code).toBe(FAILURE_EXIT_CODE)
    expect(processIsAlive(child.pid)).toBe(false)
    expect(stdout).toBe('')
    expect(stderr).toContain(
      '[hbar] Host startup failed (RUNTIME_START_FAILED); supervisor will retry the managed owner',
    )
    expect(stderr).not.toContain(canary)
    expect(stderr).not.toContain('HOST_STOP_FAILED')
    expect(Buffer.byteLength(stderr)).toBeLessThanOrEqual(4096)
    const marker = z
      .strictObject({
        stage: z.literal('loader-entered'),
        pid: z.number().int().positive(),
        lockOwnerPid: z.number().int().positive(),
      })
      .parse(JSON.parse(await readFile(loaderMarker, 'utf8')))
    expect(marker.pid).toBe(child.pid)
    expect(marker.lockOwnerPid).toBe(child.pid)
    await expect(access(openMarker)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(layout.hostLock)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(layout.connectionFile)).rejects.toMatchObject({ code: 'ENOENT' })
    // resolvePathLayout computes directories without creating all of them; absent OR empty is valid here.
    const databaseEntries = await readdir(layout.databases).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return []
      throw error
    })
    expect(databaseEntries).toEqual([])
    // Actual reacquisition verifies both discovery record and Windows exclusive ownership pipe release.
    const release = await acquireProcessLease(layout.hostLock)
    try {
      const owner = z
        .object({ pid: z.number().int().positive() })
        .parse(JSON.parse(await readFile(layout.hostLock, 'utf8')))
      expect(owner.pid).toBe(process.pid)
    } finally {
      await release()
    }
    await expect(access(layout.hostLock)).rejects.toMatchObject({ code: 'ENOENT' })
    // HEAD shutdown may exit without draining the journal. Its existence/events are not release proof.
    const journalText = await readFile(join(layout.diagnostics, 'hbar-host-diagnostics.jsonl'), 'utf8').catch(
      (error: unknown) => {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return undefined
        throw error
      },
    )
    if (journalText !== undefined) {
      expect(journalText).not.toContain(canary)
      expect(journalText).not.toMatch(/"event"\s*:\s*"host\.(?:listener_ready|kernel_ready)"/)
    }
    await writeFile(
      join(root, 'report.json'),
      JSON.stringify(
        {
          schema: 'hbar.host-package-loader-rejection.v1',
          pid: child.pid,
          code,
          naturalExit: !timedOut,
          processAbsent: !processIsAlive(child.pid),
          loaderEntered: true,
          runtimeOpenCalled: false,
          lockReacquired: true,
          stderrBytes: Buffer.byteLength(stderr),
          diagnosticJournalPresent: journalText !== undefined,
        },
        null,
        2,
      ),
    )
  } finally {
    clearTimeout(deadline)
    if (child.exitCode === null) {
      child.kill()
      await child.exited
    }
  }
  // Preserve this owned artifact fixture/report; no recursive removal touches another fixture.
}, 30_000)
