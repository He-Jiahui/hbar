import { expect, test } from 'bun:test'
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { diagnosticEventSchema } from '@hbar/contracts'
import { operationWatchResultSchema } from '@hbar/contracts/commands/run'
import { createRunCommandClient, createSystemCommandClient, createWorkspaceSessionCommandClient, HbarClient } from '@hbar/client'
import { z } from 'zod'

const prefix = 'hbar-host-main-diagnostics-'
const connectionSchema = z.strictObject({
  url: z.string().url(),
  token: z.string().min(1),
  pid: z.number().int().positive(),
  instanceId: z.string().min(1),
  supervisorPid: z.number().int().positive().optional(),
})

async function until<Value>(operation: () => Promise<Value>, timeoutMs: number): Promise<Value> {
  const started = Date.now()
  for (;;) {
    try {
      return await operation()
    } catch (error) {
      if (Date.now() - started >= timeoutMs) throw error
      await Bun.sleep(75)
    }
  }
}

async function drain(
  stream: ReadableStream<Uint8Array> | null,
  limit = 64 * 1024,
  timeoutMs = 180_000,
): Promise<string> {
  if (!stream) return ''
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const read = async () => {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      if (size >= limit) continue
      const chunk = next.value.subarray(0, Math.min(next.value.byteLength, limit - size))
      chunks.push(chunk)
      size += chunk.byteLength
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      read(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
  await reader.cancel().catch(() => undefined)
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
}

test('real runHost composition writes correlated Host and SQLite diagnostics', async () => {
  const temporary = await realpath(tmpdir())
  const root = join(temporary, `${prefix}${crypto.randomUUID()}`)
  const dataRoot = join(root, 'data')
  const cacheRoot = join(root, 'cache')
  const workspace = join(root, 'workspace')
  await mkdir(workspace, { recursive: true })
  const canary = 'host-main-diagnostics-anonymous-canary'
  await writeFile(join(workspace, 'diagnostics-canary.txt'), canary, { mode: 0o600 })
  const connectionFile = join(dataRoot, 'settings', 'connection.json')
  const child = Bun.spawn(
    [
      process.execPath,
      resolve('tests/fixtures/host-main-diagnostics-child.ts'),
      '--supervised',
      '--desktop',
      '--demo',
      '--data-root',
      dataRoot,
      '--cache-root',
      cacheRoot,
      '--workspace',
      workspace,
      '--port',
      '0',
    ],
    {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NODE_ENV: 'development', HBAR_DESKTOP_DEV: '1' },
      windowsHide: true,
    },
  )
  const stdout = drain(child.stdout)
  const stderr = drain(child.stderr)
  let client: HbarClient | undefined
  let exitedCleanly = false
  try {
    const connection = await until(
      async () => connectionSchema.parse(JSON.parse(await readFile(connectionFile, 'utf8'))),
      120_000,
    )
    client = new HbarClient(connection.url, connection.token)
    const connectedClient = client
    const host = await connectedClient.connect()
    expect(host.instanceId).toBe(connection.instanceId)
    const system = createSystemCommandClient(connectedClient)
    const bootstrap = await until(async () => {
      if (!(await system.execute('system.runtime.get', {})).ready) throw new Error('RUNTIME_PREPARING')
      return connectedClient.call('system.bootstrap', {})
    }, 120_000)
    const createdWorkspace = bootstrap.workspaces[0]
    if (!createdWorkspace) throw new Error('HOST_WORKSPACE_MISSING')
    const workspaceId = createdWorkspace.id
    const workspaceCommands = createWorkspaceSessionCommandClient(connectedClient)
    const runCommands = createRunCommandClient(connectedClient)
    const created = await workspaceCommands.execute(
      'session.create',
      { workspaceId, title: 'host-main-diagnostics' },
      { requestId: 'host-main-session-create', idempotencyKey: 'host-main-session-create' },
    )
    const accepted = await runCommands.execute(
      'run.submit',
      {
        sessionId: created.id,
        modelId: 'local-fixture',
        input: { text: '/tool read_file {"path":"diagnostics-canary.txt"}', images: [] },
      },
      { requestId: 'host-main-run-submit', idempotencyKey: 'host-main-run-submit' },
    )
    const terminalStatus = await until(async () => {
      const watched = operationWatchResultSchema.parse(
        await connectedClient.call('operation.watch', { operationId: accepted.operationId, cursor: 0 }),
      )
      if (!['completed', 'failed', 'cancelled', 'interrupted'].includes(watched.snapshot.status))
        throw new Error('operation still running')
      return watched.snapshot.status
    }, 5_000)
    expect(terminalStatus).toBe('completed')
    const snapshot = await connectedClient.call('session.snapshot', { sessionId: created.id, limit: 20 })
    const persistedRun = snapshot.runs.find((run) => run.id === accepted.operationId)
    if (!persistedRun) throw new Error('PERSISTED_RUN_MISSING')
    expect(persistedRun.status).toBe('completed')
    const toolResult = snapshot.messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result')
    expect(toolResult?.isError).toBe(false)
    expect(toolResult?.text).toContain(canary)
    connectedClient.disconnect()
    await child.stdin.write('hbar-test-stop\n')
    await child.stdin.end()
    const exit = await Promise.race([child.exited, Bun.sleep(7_000).then(() => -1)])
    expect(exit).toBe(0)
    const [out, err] = await Promise.all([stdout, stderr])
    expect(`${out}\n${err}`).not.toContain('Pairing code:')
    expect(`${out}\n${err}`).not.toContain(connection.token)
    const lines = (await readFile(join(dataRoot, 'diagnostics', 'hbar-host-diagnostics.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => diagnosticEventSchema.parse(JSON.parse(line)))
    expect(lines.some((event) => event.event === 'host.starting')).toBe(true)
    expect(
      lines.some((event) => event.event === 'host.kernel_ready' && event.instanceId === connection.instanceId),
    ).toBe(true)
    expect(lines.some((event) => event.event === 'host.stopped')).toBe(true)
    expect(lines.some((event) => event.event === 'host.signal_received' && event.signal === 'SIGTERM')).toBe(true)
    expect(lines.some((event) => event.event === 'host.stop_requested' && event.exitCode === 0)).toBe(true)
    expect(lines.some((event) => event.event.startsWith('rpc.'))).toBe(true)
    const runStarted = lines.find((event) => event.event === 'run.started' && event.sessionId === created.id)
    expect(runStarted).toBeDefined()
    if (!runStarted?.runId) throw new Error('RUN_DIAGNOSTIC_IDENTITY_MISSING')
    expect(runStarted.runId).toBe(persistedRun.id)
    expect(runStarted.requestId).toBe(persistedRun.requestId)
    expect(runStarted.requestId).not.toBe('host-main-run-submit')
    expect(runStarted.instanceId).toBe(connection.instanceId)
    expect(runStarted.sessionId).toBe(created.id)
    expect(runStarted?.rpcId).toBeUndefined()
    expect(
      lines.some(
        (event) =>
          event.event === 'model.started' &&
          event.runId === runStarted?.runId &&
          event.requestId === runStarted?.requestId &&
          event.rpcId === undefined,
      ),
    ).toBe(true)
    expect(
      lines.some(
        (event) =>
          event.event === 'model.settled' &&
          event.runId === runStarted?.runId &&
          event.requestId === runStarted?.requestId &&
          event.rpcId === undefined,
      ),
    ).toBe(true)
    const toolStarted = lines.find((event) => event.event === 'tool.started' && event.runId === runStarted?.runId)
    expect(toolStarted).toBeDefined()
    expect(toolStarted?.callId).toBeString()
    expect(toolStarted?.requestId).toBe(runStarted.requestId)
    expect(
      lines.some(
        (event) =>
          event.event === 'tool.settled' &&
          event.runId === toolStarted?.runId &&
          event.callId === toolStarted?.callId &&
          event.requestId === toolStarted?.requestId &&
          event.rpcId === undefined,
      ),
    ).toBe(true)
    const storageEvent = lines.find(
      (event) =>
        event.event === 'storage.request_completed' &&
        event.runId === runStarted.runId &&
        event.requestId === runStarted.requestId,
    )
    expect(storageEvent).toBeDefined()
    if (!storageEvent) throw new Error('STORAGE_DIAGNOSTIC_IDENTITY_MISSING')
    expect(storageEvent?.rpcId).toBeUndefined()
    expect(
      lines.some(
        (event) =>
          event.event === 'sqlite.request_completed' &&
          event.runId === runStarted.runId &&
          event.storageRequestId === storageEvent.storageRequestId &&
          event.requestId === storageEvent.requestId &&
          event.rpcId === undefined,
      ),
    ).toBe(true)
    expect(
      lines.some(
        (event) =>
          event.event === 'sqlite.configured' &&
          event.instanceId === connection.instanceId &&
          event.sqliteVersion !== undefined &&
          event.journalMode === 'wal' &&
          event.synchronous === 2,
      ),
    ).toBe(true)
    expect(await readFile(join(dataRoot, 'diagnostics', 'hbar-host-diagnostics.jsonl'), 'utf8')).not.toContain(canary)
    exitedCleanly = true
  } finally {
    client?.disconnect()
    if (child.exitCode === null) {
      try {
        await child.stdin.write('hbar-test-stop\n')
        await child.stdin.end()
      } catch {
        // A child that already exited has no writable control pipe.
      }
      await Promise.race([child.exited, Bun.sleep(3_000)])
      if (child.exitCode === null) {
        child.kill()
        await Promise.race([child.exited, Bun.sleep(3_000)])
      }
    }
    const owned = await realpath(root).catch(() => '')
    if (exitedCleanly && dirname(owned) === temporary && basename(owned).startsWith(prefix))
      await rm(owned, { recursive: true, force: true })
  }
})
