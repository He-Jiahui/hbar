import { test, expect } from 'bun:test'
import { diagnosticEventSchema, type DiagnosticEvent, type DiagnosticSink } from '@hbar/contracts'
import { createDiagnosticScope } from '@hbar/kernel/diagnostic-scope'
import { protectDiagnosticSink } from '../packages/kernel/src/diagnostic-scope'
import { createKernelExecutionDiagnostics } from '../packages/kernel/src/execution-diagnostics'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'

function collector(events: DiagnosticEvent[]): DiagnosticSink {
  return { emit: (event) => events.push(event) }
}

async function removeFixture(root: string): Promise<void> {
  const resolved = await realpath(root)
  const expectedParent = await realpath(tmpdir())
  if (dirname(resolved) !== expectedParent || !basename(resolved).startsWith('hbar-kernel-execution-'))
    throw new Error('Refusing to remove an unexpected Kernel diagnostics fixture')
  await rm(resolved, { recursive: true, force: true })
}

const identity = {
  instanceId: 'instance-1',
  sessionId: 'session-1',
  runId: 'run-1',
  requestId: 'request-1',
}

test('kernel execution diagnostics records redacted run/model/tool lifecycle metadata', () => {
  const events: DiagnosticEvent[] = []
  const diagnostics = createKernelExecutionDiagnostics({ sink: collector(events) })
  diagnostics.runStarted(identity, 3)
  diagnostics.modelPrepared({ ...identity, stepId: 'step-1', method: 'provider/model' })
  diagnostics.modelStarted({ ...identity, stepId: 'step-1', method: 'provider/model' })
  diagnostics.toolAdmission({ ...identity, callId: 'call-1' }, 'shell command')
  diagnostics.toolApproval({ ...identity, callId: 'call-1' }, 'shell command')
  diagnostics.toolStarted({ ...identity, callId: 'call-1' }, 'shell command')
  diagnostics.toolSettled({ ...identity, callId: 'call-1' }, 'success', 12, 'shell command')
  diagnostics.modelSettled({ ...identity, stepId: 'step-1' }, 'success', 22)
  diagnostics.runSettled(identity, 'success', 30)

  expect(events).toHaveLength(9)
  for (const event of events) expect(diagnosticEventSchema.safeParse(event).success).toBe(true)
  const serialized = JSON.stringify(events)
  expect(serialized).not.toContain('shell command')
  expect(serialized).not.toContain('prompt')
  expect(serialized).not.toContain('secret')
  expect(events.at(-1)?.event).toBe('run.settled')
  expect(events.at(-1)?.durationMs).toBe(30)
})

test('kernel execution diagnostics does not attach background Runs to an ambient RPC scope', () => {
  const events: DiagnosticEvent[] = []
  const scope = createDiagnosticScope()
  const diagnostics = createKernelExecutionDiagnostics({ sink: collector(events), scope })
  scope.run({ rpcId: 'rpc-ambient', requestId: 'request-ambient' }, () => {
    diagnostics.runStarted({ ...identity, runId: 'run-explicit' })
  })

  expect(events).toHaveLength(1)
  expect(events[0]?.rpcId).toBeUndefined()
  expect(events[0]?.requestId).toBe('request-1')
  expect(events[0]?.runId).toBe('run-explicit')
})

test('kernel execution diagnostics isolates sink failures and records cancellation, timeout, and recovery', () => {
  const events: DiagnosticEvent[] = []
  let calls = 0
  const diagnostics = createKernelExecutionDiagnostics({
    sink: {
      emit: (event) => {
        calls += 1
        events.push(event)
        throw new Error('sink failure')
      },
    },
  })
  expect(() => diagnostics.runCancelled(identity, 4)).not.toThrow()
  expect(() => diagnostics.toolTimeout({ ...identity, callId: 'call-1' }, 'tool', 8)).not.toThrow()
  expect(() => diagnostics.recovery(identity, 'failure', 9)).not.toThrow()
  expect(calls).toBe(3)
  expect(events.map((event) => event.event)).toEqual(['run.cancelled', 'tool.timeout', 'run.recovery'])
})

test('real Kernel local fixture emits run and model lifecycle diagnostics without payloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-execution-diagnostics-'))
  const events: DiagnosticEvent[] = []
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    diagnostics: collector(events),
  })
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Kernel fixture did not create a workspace')
    const session = await kernel.createSession(workspace.id)
    const run = await kernel.submit(session.id, 'diagnostic-run', { text: 'hello', images: [] }, 'local-fixture')
    await kernel.waitForIdle()
    expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
    const eventNames = events.map((event) => event.event)
    for (const expected of ['run.started', 'model.prepared', 'model.started', 'model.settled', 'run.settled'])
      expect(eventNames.includes(expected)).toBe(true)
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('hello')
    expect(serialized).not.toContain('prompt')
  } finally {
    await kernel.close()
    await removeFixture(root)
  }
})

test('real Kernel cancellation emits a terminal cancellation diagnostic', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-execution-cancel-diagnostics-'))
  const events: DiagnosticEvent[] = []
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    diagnostics: collector(events),
  })
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Kernel fixture did not create a workspace')
    const session = await kernel.createSession(workspace.id)
    const run = await kernel.submit(session.id, 'diagnostic-cancel', { text: '/slow', images: [] }, 'local-fixture')
    for (let attempt = 0; attempt < 100 && !kernel.active.size; attempt += 1) await Bun.sleep(10)
    await kernel.cancel(run.id)
    await kernel.waitForIdle()
    expect((await kernel.storage.call('run', run.id)).status).toBe('cancelled')
    expect(events.some((event) => event.event === 'run.cancelled')).toBe(true)
  } finally {
    await kernel.close()
    await removeFixture(root)
  }
})

test('queued Runs receive their own diagnostic scope instead of the admitting RPC scope', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-execution-scope-diagnostics-'))
  const events: DiagnosticEvent[] = []
  const scope = createDiagnosticScope()
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    diagnostics: protectDiagnosticSink(collector(events), scope),
    diagnosticScope: scope,
  })
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Kernel fixture did not create a workspace')
    const session = await kernel.createSession(workspace.id)
    const runs = await scope.run({ rpcId: 'rpc-admission' }, async () => {
      const first = await kernel.submit(session.id, 'queued-first', { text: '/slow', images: [] }, 'local-fixture')
      const second = await kernel.submit(session.id, 'queued-second', { text: 'hello', images: [] }, 'local-fixture')
      return [first, second]
    })
    await kernel.waitForIdle()
    const admittedEvents = events.filter((event) => event.event === 'run.admitted')
    expect(admittedEvents).toHaveLength(2)
    expect(admittedEvents.every((event) => event.rpcId === 'rpc-admission')).toBe(true)
    const runEvents = events.filter(
      (event) => event.runId && event.event.startsWith('run.') && event.event !== 'run.admitted',
    )
    for (const run of runs) {
      const correlated = runEvents.filter((event) => event.runId === run.id)
      expect(correlated.length).toBeGreaterThan(0)
      expect(correlated.every((event) => event.requestId === run.requestId && event.rpcId === undefined)).toBe(true)
    }
    const storageEvents = events.filter(
      (event) => (event.component === 'storage' || event.component === 'sqlite') && event.runId,
    )
    for (const run of runs) {
      const correlated = storageEvents.filter((event) => event.runId === run.id)
      expect(correlated.length).toBeGreaterThan(0)
      expect(correlated.every((event) => event.requestId === run.requestId)).toBe(true)
      expect(correlated.every((event) => event.rpcId === undefined)).toBe(true)
    }
  } finally {
    await kernel.close()
    await removeFixture(root)
  }
})

function diagnosticGate(): { promise: Promise<void>; release: () => void } {
  let release = (): void => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

async function abortToolFixture(timeoutMs?: number) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-execution-abort-'))
  const events: DiagnosticEvent[] = []
  const entered = diagnosticGate()
  const gate = diagnosticGate()
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    diagnostics: collector(events),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Abort fixture did not create a workspace')
  const session = await kernel.createSession(workspace.id)
  kernel.tools.register({
    name: 'diagnostic_abort_probe',
    description: 'Bounded diagnostics abort probe',
    effect: 'read',
    inputSchema: z.object({}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    async execute(_args, context) {
      entered.release()
      let aborted = false
      let resolveAbort = (): void => {}
      const onAbort = (): void => {
        aborted = true
        resolveAbort()
      }
      const abortPromise = new Promise<void>((resolve) => {
        resolveAbort = resolve
      })
      if (context.signal.aborted) onAbort()
      else context.signal.addEventListener('abort', onAbort, { once: true })
      try {
        await Promise.race([gate.promise, abortPromise])
      } finally {
        context.signal.removeEventListener('abort', onAbort)
      }
      if (aborted || context.signal.aborted) throw context.signal.reason
      return { text: 'probe complete' }
    },
  })
  return { root, events, kernel, session, entered, release: gate.release }
}

test('real tool user cancellation is the only Host abort classified as tool.cancelled', async () => {
  const f = await abortToolFixture()
  try {
    const run = await f.kernel.submit(
      f.session.id,
      'abort-user',
      { text: '/tool diagnostic_abort_probe {}', images: [], approval: 'allow' },
      'local-fixture',
    )
    await f.entered.promise
    await f.kernel.cancel(run.id)
    f.release()
    await f.kernel.waitForIdle()
    const events = f.events.filter((event) => event.runId === run.id)
    expect(events.some((event) => event.event === 'tool.cancelled' && event.errorCode === 'USER_CANCELLED')).toBe(true)
    expect(events.some((event) => event.event === 'tool.settled' && event.outcome === 'skipped')).toBe(true)
    const result = (await f.kernel.snapshot(f.session.id)).messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result')
    expect(result && result.type === 'tool_result' ? result.outcome : undefined).toMatchObject({
      kind: 'cancelled',
      executionStarted: true,
    })
  } finally {
    f.release()
    await f.kernel.close()
    await removeFixture(f.root)
  }
})

test('real Host shutdown is recorded as a failure or interruption, never user cancellation', async () => {
  const f = await abortToolFixture()
  let closed = false
  let verified = false
  try {
    const run = await f.kernel.submit(
      f.session.id,
      'abort-shutdown',
      { text: '/tool diagnostic_abort_probe {}', images: [], approval: 'allow' },
      'local-fixture',
    )
    await f.entered.promise
    const closing = f.kernel.close()
    await closing
    closed = true
    const events = f.events.filter((event) => event.runId === run.id)
    expect(events.some((event) => event.event === 'tool.cancelled')).toBe(false)
    expect(events.some((event) => event.event === 'tool.failed' && event.errorCode === 'HOST_SHUTTING_DOWN')).toBe(true)
    expect(events.some((event) => event.event === 'tool.settled' && event.outcome !== 'skipped')).toBe(true)
    verified = true
  } finally {
    f.release()
    if (!closed) await f.kernel.close()
    if (verified) await removeFixture(f.root)
  }
})

test('real bounded tool timeout emits tool.timeout without user cancellation', async () => {
  const f = await abortToolFixture(50)
  try {
    const run = await f.kernel.submit(
      f.session.id,
      'abort-timeout',
      { text: '/tool diagnostic_abort_probe {}', images: [], approval: 'allow' },
      'local-fixture',
    )
    await f.entered.promise
    await f.kernel.waitForIdle()
    const events = f.events.filter((event) => event.runId === run.id)
    expect(events.some((event) => event.event === 'tool.timeout' && event.errorCode === 'TOOL_TIMEOUT')).toBe(true)
    expect(events.some((event) => event.event === 'tool.cancelled')).toBe(false)
  } finally {
    f.release()
    await f.kernel.close()
    await removeFixture(f.root)
  }
})
