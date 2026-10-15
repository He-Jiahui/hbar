import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { HbarClient, createAgentCommandClient } from '@hbar/client'
import { emptyUsage } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { HarnessDriver } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function git(root: string, ...args: string[]) {
  const child = Bun.spawn(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  if (code !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr}`)
}

async function fixture(usePatchDriver = true) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-patch-'))
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'first.txt'), 'parent first\n')
  await writeFile(join(root, 'src', 'second.txt'), 'parent second\n')
  await git(root, 'init')
  await git(root, 'config', 'user.name', 'hbar test')
  await git(root, 'config', 'user.email', 'hbar@example.invalid')
  await git(root, 'add', 'src')
  await git(root, 'commit', '-m', 'fixture')
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Patch fixture driver',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      description: 'Writes deterministic files inside the child workspace',
      scope: 'host' as const,
      required: true,
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          await writeFile(join(input.workspace.path, 'src', 'first.txt'), 'child first\n')
          await writeFile(join(input.workspace.path, 'src', 'second.txt'), 'child second\n')
          await input.commit('assistant', [{ type: 'text', text: 'Implemented both scoped files.' }])
        },
        summarize: async () => ({ text: 'summary', usage: emptyUsage() }),
      })
    },
  })
  const home = join(root, '.hbar-data')
  const open = () =>
    Kernel.create({
      home,
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      ...(usePatchDriver ? { profile: { replacements: { 'driver.pi': driver } } } : {}),
    })
  let kernel = await open()
  await kernel.changePlugin('git.codex', true, { worktreeRoot: join(root, '.hbar-worktrees') })
  await kernel.changePlugin('budget.codex', true, { autoContinue: false })
  let workspace = (await kernel.storage.call('workspaces')).find((entry) => entry.path === root)!
  let parent = await kernel.createSession(workspace.id, 'parent')
  let host = await startServer(kernel, { port: 0 })
  let client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  await client.pair(host.pairing.code, 'agent patch test')
  let commands = createAgentCommandClient(client)
  const close = async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
  }
  cleanups.push(async () => {
    await close()
    await rm(root, { recursive: true, force: true })
  })
  const reopen = async () => {
    await close()
    kernel = await open()
    workspace = await kernel.storage.call('workspace', workspace.id)
    parent = await kernel.storage.call('session', parent.id)
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'agent patch restart test')
    commands = createAgentCommandClient(client)
  }
  return {
    root,
    get kernel() {
      return kernel
    },
    get parent() {
      return parent
    },
    get commands() {
      return commands
    },
    reopen,
  }
}

async function createPatchAgent(resource: Awaited<ReturnType<typeof fixture>>, key: string) {
  const record = await resource.commands.execute(
    'agent.create',
    {
      parentSessionId: resource.parent.id,
      objective: 'Update the two scoped fixture files',
      modelId: 'local-fixture',
      approval: 'deny',
      patchTask: {
        itemId: 'implementation',
        planRevision: 3,
        scope: { readPaths: ['src'], writePaths: ['src'], tools: [] },
        acceptanceChecks: [],
      },
    },
    { idempotencyKey: key },
  )
  await resource.kernel.waitForIdle()
  return resource.commands.execute('agent.result.get', {
    parentSessionId: resource.parent.id,
    agentId: record.agentId,
  })
}

function within(root: string, candidate: string): boolean {
  const part = relative(root, candidate)
  return part === '' || (part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part))
}

function quoteShellPath(path: string): string {
  if (process.platform === 'win32') return `'${path.replaceAll("'", "''")}'`
  return `'${path.replaceAll("'", "'\"'\"'")}'`
}

function successfulShellProbeCommand(markerPath: string, marker: string): string {
  if (process.platform === 'win32') {
    const path = quoteShellPath(markerPath)
    const value = quoteShellPath(marker)
    return [
      '$identity = (& whoami.exe).Trim()',
      `$markerPath = ${path}`,
      `$expected = ${value}`,
      'Set-Content -LiteralPath $markerPath -Value $expected -NoNewline -ErrorAction Stop',
      '$observed = Get-Content -Raw -LiteralPath $markerPath -ErrorAction Stop',
      'if ($observed -cne $expected) { exit 19 }',
      'Write-Output ("identity:" + $identity)',
      'Write-Output ("marker:" + $observed)',
    ].join('; ')
  }
  const path = quoteShellPath(markerPath)
  const value = quoteShellPath(marker)
  return [
    'identity="$(id -un)"',
    `printf '%s' ${value} > ${path}`,
    `observed="$(cat ${path})"`,
    `test "$observed" = ${value}`,
    'printf "identity:%s\\nmarker:%s\\n" "$identity" "$observed"',
  ].join('; ')
}

function delayedShellWriteCommand(
  startedPath: string,
  startedMarker: string,
  finalPath: string,
  finalMarker: string,
): string {
  const started = quoteShellPath(startedPath)
  const startedValue = quoteShellPath(startedMarker)
  const final = quoteShellPath(finalPath)
  const finalValue = quoteShellPath(finalMarker)
  return process.platform === 'win32'
    ? `Set-Content -LiteralPath ${started} -Value ${startedValue} -NoNewline -ErrorAction Stop; Start-Sleep -Seconds 30; Set-Content -LiteralPath ${final} -Value ${finalValue} -NoNewline -ErrorAction Stop`
    : `printf '%s' ${startedValue} > ${started}; sleep 30; printf '%s' ${finalValue} > ${final}`
}

async function waitForMarker(path: string, marker: string, label: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const observed = await readFile(path, 'utf8')
      if (observed === marker) return
      throw new Error(`${label}_MISMATCH:${JSON.stringify(observed)}`)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'EBUSY')))
        throw error
    }
    if (Date.now() >= deadline) throw new Error(`${label}_MISSING`)
    await Bun.sleep(25)
  }
}

function currentShellIdentity(): string {
  const command = process.platform === 'win32' ? ['whoami.exe'] : ['id', '-un']
  const result = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) throw new Error('PROCESS_PROBE_HOST_IDENTITY_UNAVAILABLE')
  const identity = result.stdout.toString('utf8').trim()
  if (!identity) throw new Error('PROCESS_PROBE_HOST_IDENTITY_EMPTY')
  return identity
}

async function waitForAgentRunId(resource: Awaited<ReturnType<typeof fixture>>, agentId: string): Promise<string> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const record = await resource.commands.execute('agent.result.get', {
      parentSessionId: resource.parent.id,
      agentId,
    })
    if (record.runId) return record.runId
    if (['completed', 'cancelled', 'failed', 'interrupted'].includes(record.status))
      throw new Error(`PROCESS_PROBE_TERMINAL_WITHOUT_RUN:${agentId}:${record.status}`)
    if (Date.now() >= deadline) throw new Error(`PROCESS_PROBE_RUN_ID_TIMEOUT:${agentId}`)
    await Bun.sleep(25)
  }
}

function processPatchTask(allowProcessTools?: boolean, tools: string[] = ['shell']) {
  return {
    itemId: 'process-probe',
    planRevision: 1,
    scope: { readPaths: [], writePaths: [], tools },
    ...(allowProcessTools === undefined ? {} : { allowProcessTools }),
    acceptanceChecks: [],
  }
}

async function assertAgentWorktreeRemoved(resource: Awaited<ReturnType<typeof fixture>>, sessionId: string) {
  const session = await resource.kernel.storage.call('session', sessionId)
  const workspace = await resource.kernel.storage.call('workspace', session.workspaceId)
  expect(workspace.path).toStartWith(join(resource.root, '.hbar-worktrees'))
  await expect(stat(workspace.path)).rejects.toMatchObject({ code: 'ENOENT' })
}

test('isolated agents expose a durable patch and only change the parent after explicit apply', async () => {
  const resource = await fixture()
  const ready = await createPatchAgent(resource, 'isolated-ready')
  expect(ready).toMatchObject({
    isolated: true,
    status: 'completed',
    resultSummary: 'Implemented both scoped files.',
    patch: { status: 'ready', planRevision: 3, files: [{ operation: 'update' }, { operation: 'update' }] },
  })
  const isolatedSession = await resource.kernel.storage.call('session', ready.sessionId)
  expect((await resource.kernel.storage.call('workspace', isolatedSession.workspaceId)).path).toStartWith(
    join(resource.root, '.hbar-worktrees'),
  )
  expect(await readFile(join(resource.root, 'src', 'first.txt'), 'utf8')).toBe('parent first\n')

  await resource.reopen()
  const recovered = await resource.commands.execute('agent.result.get', {
    parentSessionId: resource.parent.id,
    agentId: ready.agentId,
  })
  expect(recovered.patch).toMatchObject({ patchId: ready.patch?.patchId, status: 'ready' })
  const applied = await resource.commands.execute(
    'agent.patch.apply',
    { parentSessionId: resource.parent.id, agentId: ready.agentId, planRevision: 3 },
    { idempotencyKey: 'apply-ready' },
  )
  expect(applied.patch?.status).toBe('applied')
  expect(await readFile(join(resource.root, 'src', 'first.txt'), 'utf8')).toBe('child first\n')
  expect(await readFile(join(resource.root, 'src', 'second.txt'), 'utf8')).toBe('child second\n')
})

test('a parent conflict rejects the whole patch without partially writing other files', async () => {
  const resource = await fixture()
  const ready = await createPatchAgent(resource, 'isolated-conflict')
  await writeFile(join(resource.root, 'src', 'second.txt'), 'parent changed concurrently\n')
  const conflict = await resource.commands.execute(
    'agent.patch.apply',
    { parentSessionId: resource.parent.id, agentId: ready.agentId, planRevision: 3 },
    { idempotencyKey: 'apply-conflict' },
  )
  expect(conflict.patch?.status).toBe('conflict')
  expect(await readFile(join(resource.root, 'src', 'first.txt'), 'utf8')).toBe('parent first\n')
  expect(await readFile(join(resource.root, 'src', 'second.txt'), 'utf8')).toBe('parent changed concurrently\n')
})

test('patch apply rejects isolated content that no longer matches the captured artifact hash', async () => {
  const resource = await fixture()
  const ready = await createPatchAgent(resource, 'isolated-integrity')
  const isolatedSession = await resource.kernel.storage.call('session', ready.sessionId)
  const isolatedWorkspace = await resource.kernel.storage.call('workspace', isolatedSession.workspaceId)
  await writeFile(join(isolatedWorkspace.path, 'src', 'first.txt'), 'tampered after capture\n')
  const rejected = await resource.commands.execute(
    'agent.patch.apply',
    { parentSessionId: resource.parent.id, agentId: ready.agentId, planRevision: 3 },
    { idempotencyKey: 'apply-tampered' },
  )
  expect(rejected.patch?.status).toBe('rejected')
  expect(await readFile(join(resource.root, 'src', 'first.txt'), 'utf8')).toBe('parent first\n')
  expect(await readFile(join(resource.root, 'src', 'second.txt'), 'utf8')).toBe('parent second\n')
  await expect(stat(isolatedWorkspace.path)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('isolated patch tasks deny process tools by default even when the tool name is in scope', async () => {
  const resource = await fixture(false)
  const markerPath = join(resource.root, `denied-process-${crypto.randomUUID()}.txt`)
  const marker = `must-not-write:${crypto.randomUUID()}`
  const record = await resource.commands.execute(
    'agent.create',
    {
      parentSessionId: resource.parent.id,
      objective: `/tool shell ${JSON.stringify({ command: successfulShellProbeCommand(markerPath, marker), timeout_ms: 30_000 })}`,
      modelId: 'local-fixture',
      approval: 'allow',
      patchTask: processPatchTask(),
    },
    { idempotencyKey: 'isolated-process-denied' },
  )
  await resource.kernel.waitForIdle()
  const snapshot = await resource.kernel.snapshot(record.sessionId)
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .some(
        (block) =>
          block.type === 'tool_result' &&
          block.isError &&
          block.text.includes('Process tool shell is disabled for this isolated patch task'),
      ),
  ).toBeTrue()
  expect(await Bun.file(markerPath).exists()).toBeFalse()
  expect(
    await resource.commands.execute('agent.result.get', {
      parentSessionId: resource.parent.id,
      agentId: record.agentId,
    }),
  ).toMatchObject({ patch: null })
  await assertAgentWorktreeRemoved(resource, record.sessionId)
})

test('allowProcessTools still requires the process tool name in the isolated task allowlist', async () => {
  const resource = await fixture(false)
  const markerPath = join(resource.root, `unlisted-process-${crypto.randomUUID()}.txt`)
  const marker = `must-not-write:${crypto.randomUUID()}`
  const record = await resource.commands.execute(
    'agent.create',
    {
      parentSessionId: resource.parent.id,
      objective: `/tool shell ${JSON.stringify({ command: successfulShellProbeCommand(markerPath, marker), timeout_ms: 30_000 })}`,
      modelId: 'local-fixture',
      approval: 'allow',
      patchTask: processPatchTask(true, []),
    },
    { idempotencyKey: 'isolated-process-not-listed' },
  )
  await resource.kernel.waitForIdle()
  const snapshot = await resource.kernel.snapshot(record.sessionId)
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .some(
        (block) =>
          block.type === 'tool_result' &&
          block.isError &&
          block.text.includes('Tool shell is outside the delegated scope'),
      ),
  ).toBeTrue()
  expect(await Bun.file(markerPath).exists()).toBeFalse()
  await assertAgentWorktreeRemoved(resource, record.sessionId)
})

test('explicit process opt-in runs a bounded shell identity and owned temporary marker probe', async () => {
  const resource = await fixture(false)
  const attempt = crypto.randomUUID()
  const tempRoot = join(resource.root, `agent-owned-process-probe-${attempt}`)
  await mkdir(tempRoot)
  const markerPath = join(tempRoot, 'marker.txt')
  const marker = `agent-process:${attempt}`
  const hostIdentity = currentShellIdentity()
  const originalRoot = await realpath(resource.root)
  const originalTempRoot = await realpath(tempRoot)
  expect(basename(originalTempRoot)).toBe(`agent-owned-process-probe-${attempt}`)
  expect(within(originalRoot, originalTempRoot)).toBeTrue()

  const command = successfulShellProbeCommand(markerPath, marker)
  const record = await resource.commands.execute(
    'agent.create',
    {
      parentSessionId: resource.parent.id,
      objective: `/tool shell ${JSON.stringify({ command, timeout_ms: 30_000 })}`,
      modelId: 'local-fixture',
      approval: 'allow',
      patchTask: processPatchTask(true),
    },
    { idempotencyKey: 'isolated-process-explicit-allow' },
  )
  const runId = await waitForAgentRunId(resource, record.agentId)
  const session = await resource.kernel.storage.call('session', record.sessionId)
  const workspace = await resource.kernel.storage.call('workspace', session.workspaceId)
  const worktreeRoot = resolve(workspace.path)
  expect(within(worktreeRoot, originalTempRoot)).toBeFalse()
  expect(relative(originalRoot, worktreeRoot)).not.toBe('..')

  await resource.kernel.waitForIdle()
  const snapshot = await resource.kernel.snapshot(record.sessionId)
  const run = snapshot.runs.find((candidate) => candidate.id === runId)
  expect(run?.status).toBe('completed')
  expect(run?.input.approval).toBe('allow')
  expect(run?.input.sandbox).toBeUndefined()
  const calls = snapshot.messages.flatMap((message) => message.content).filter((block) => block.type === 'tool_call')
  const results = snapshot.messages
    .flatMap((message) => message.content)
    .filter((block) => block.type === 'tool_result')
  expect(calls).toHaveLength(1)
  expect(results).toHaveLength(1)
  const call = calls[0]
  const result = results[0]
  expect(call?.name).toBe('shell')
  expect(call?.args.command).toBe(command)
  expect(call?.args.timeout_ms).toBe(30_000)
  expect(result).toMatchObject({
    type: 'tool_result',
    name: 'shell',
    callId: call?.callId,
    isError: false,
    outcome: { kind: 'succeeded' },
  })
  expect(result?.type === 'tool_result' ? result.text : '').toContain('identity:')
  expect(result?.type === 'tool_result' ? result.text : '').toContain(`identity:${hostIdentity}`)
  expect(result?.type === 'tool_result' ? result.text : '').toContain(`marker:${marker}`)
  expect(await readFile(markerPath, 'utf8')).toBe(marker)
  await assertAgentWorktreeRemoved(resource, record.sessionId)

  const canonicalRoot = await realpath(resource.root)
  const canonicalTemp = await realpath(tempRoot)
  expect(canonicalRoot).toBe(originalRoot)
  expect(canonicalTemp).toBe(originalTempRoot)
  expect(basename(canonicalTemp)).toBe(`agent-owned-process-probe-${attempt}`)
  if (!within(canonicalRoot, canonicalTemp) || within(worktreeRoot, canonicalTemp))
    throw new Error('OWNED_PROCESS_PROBE_CLEANUP_FENCE_FAILED')
  await rm(tempRoot, { recursive: true })
})

test('cancel stops an opted-in process run before its delayed marker write and removes only its owned probe directory', async () => {
  const resource = await fixture(false)
  const attempt = crypto.randomUUID()
  const tempRoot = join(resource.root, `agent-owned-cancel-probe-${attempt}`)
  await mkdir(tempRoot)
  const startedPath = join(tempRoot, 'started.txt')
  const finalPath = join(tempRoot, 'final.txt')
  const startedMarker = `agent-cancel-started:${attempt}`
  const finalMarker = `agent-cancel-final:${attempt}`
  const originalRoot = await realpath(resource.root)
  const originalTempRoot = await realpath(tempRoot)
  const command = delayedShellWriteCommand(startedPath, startedMarker, finalPath, finalMarker)
  const record = await resource.commands.execute(
    'agent.create',
    {
      parentSessionId: resource.parent.id,
      objective: `/tool shell ${JSON.stringify({ command, timeout_ms: 60_000 })}`,
      modelId: 'local-fixture',
      approval: 'allow',
      patchTask: processPatchTask(true),
    },
    { idempotencyKey: 'isolated-process-cancel-owned' },
  )
  const runId = await waitForAgentRunId(resource, record.agentId)
  const session = await resource.kernel.storage.call('session', record.sessionId)
  const workspace = await resource.kernel.storage.call('workspace', session.workspaceId)
  const worktreeRoot = resolve(workspace.path)
  await waitForMarker(startedPath, startedMarker, 'PROCESS_PROBE_STARTED_MARKER')
  const active = await resource.kernel.snapshot(record.sessionId)
  const activeRun = active.runs.find((candidate) => candidate.id === runId)
  expect(activeRun?.status).toBe('running')
  expect(activeRun?.input.approval).toBe('allow')
  expect(activeRun?.input.sandbox).toBeUndefined()

  const requested = await resource.commands.execute('agent.cancel', {
    parentSessionId: resource.parent.id,
    agentId: record.agentId,
  })
  expect(['cancelRequested', 'cancelled']).toContain(requested.status)
  await resource.kernel.waitForIdle()
  const finalSnapshot = await resource.kernel.snapshot(record.sessionId)
  const finalRun = finalSnapshot.runs.find((candidate) => candidate.id === runId)
  expect(finalRun?.status).toBe('cancelled')
  const calls = finalSnapshot.messages
    .flatMap((message) => message.content)
    .filter((block) => block.type === 'tool_call')
  const results = finalSnapshot.messages
    .flatMap((message) => message.content)
    .filter((block) => block.type === 'tool_result')
  expect(calls).toHaveLength(1)
  expect(results).toHaveLength(1)
  const call = calls[0]
  const result = results[0]
  expect(call?.name).toBe('shell')
  expect(call?.args.command).toBe(command)
  expect(result).toMatchObject({
    type: 'tool_result',
    name: 'shell',
    callId: call?.callId,
    isError: true,
    outcome: { kind: 'cancelled', executionStarted: true },
  })
  const execution = result?.type === 'tool_result' ? result.execution : undefined
  if (!execution?.endedAt) throw new Error('PROCESS_PROBE_EXECUTION_END_MISSING')
  expect(execution.endedAt).toBeGreaterThanOrEqual(execution.startedAt)
  await waitForMarker(startedPath, startedMarker, 'PROCESS_PROBE_STARTED_MARKER_AFTER_SETTLEMENT')
  expect(await Bun.file(finalPath).exists()).toBeFalse()
  await assertAgentWorktreeRemoved(resource, record.sessionId)

  const canonicalRoot = await realpath(resource.root)
  const canonicalTemp = await realpath(tempRoot)
  expect(canonicalRoot).toBe(originalRoot)
  expect(canonicalTemp).toBe(originalTempRoot)
  expect(basename(canonicalTemp)).toBe(`agent-owned-cancel-probe-${attempt}`)
  if (!within(canonicalRoot, canonicalTemp) || within(worktreeRoot, canonicalTemp))
    throw new Error('OWNED_CANCEL_PROBE_CLEANUP_FENCE_FAILED')
  await rm(tempRoot, { recursive: true })
})

test('review agents continue to deny process tools even when the review scope lists shell', async () => {
  const resource = await fixture(false)
  const record = await resource.commands.execute(
    'agent.create',
    {
      parentSessionId: resource.parent.id,
      objective: '/tool shell {"command":"echo review-should-not-run"}',
      modelId: 'local-fixture',
      approval: 'allow',
      reviewTask: {
        reviewId: 'review-process-test',
        planRevision: 1,
        stepTextHash: 'a'.repeat(64),
        workspaceFingerprint: 'b'.repeat(64),
        scope: { readPaths: ['src'], writePaths: [], tools: ['shell'] },
      },
    },
    { idempotencyKey: 'review-process-denied' },
  )
  await resource.kernel.waitForIdle()
  const snapshot = await resource.kernel.snapshot(record.sessionId)
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .some(
        (block) =>
          block.type === 'tool_result' &&
          block.isError &&
          block.text.includes('Review agents cannot use process tools'),
      ),
  ).toBeTrue()
})
