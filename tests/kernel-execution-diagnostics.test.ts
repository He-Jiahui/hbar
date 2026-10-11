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

test('provider terminal diagnostics retain typed failure and response facts without payloads', () => {
  const events: DiagnosticEvent[] = []
  const diagnostics = createKernelExecutionDiagnostics({ sink: collector(events) })
  const failed = {
    ...identity,
    method: 'model.request',
    modelRequestId: 'model-request-stream-failed',
    providerId: 'fixture',
    model: 'gpt-6.1-sol',
    protocol: 'openai-responses',
    stopReason: 'error' as const,
    httpStatus: 200,
    upstreamRequestIdSha256: 'a'.repeat(64),
    failureKind: 'stream' as const,
    failurePhase: 'stream' as const,
    errorCode: 'PROVIDER_STREAM_INTERRUPTED',
  }
  diagnostics.providerRequestSettled(failed, 'failure', 37)
  diagnostics.modelFailed(failed, failed.errorCode, 37)
  expect(events.map((event) => event.event)).toEqual(['provider.request_settled', 'model.failed'])
  for (const event of events) {
    expect(event).toMatchObject({
      modelRequestId: failed.modelRequestId,
      httpStatus: 200,
      failureKind: 'stream',
      failurePhase: 'stream',
      errorCode: failed.errorCode,
    })
    expect(diagnosticEventSchema.safeParse(event).success).toBe(true)
  }
  diagnostics.providerRequestSettled(
    {
      ...identity,
      modelRequestId: 'model-request-transport',
      transportKind: 'connection',
      transportCode: 'ECONNREFUSED',
      failureKind: 'transport',
      failurePhase: 'fetch',
      errorCode: 'PROVIDER_CONNECTION_FAILED',
    },
    'failure',
    1,
  )
  expect(events.at(-1)).toMatchObject({
    transportKind: 'connection',
    transportCode: 'ECONNREFUSED',
    failureKind: 'transport',
    failurePhase: 'fetch',
  })
  expect(events.at(-1)?.httpStatus).toBeUndefined()
  expect(events.at(-1)?.upstreamRequestIdSha256).toBeUndefined()
})

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

test('kernel execution diagnostics preserves the bounded slice phase without error text', () => {
  const events: DiagnosticEvent[] = []
  const diagnostics = createKernelExecutionDiagnostics({ sink: collector(events) })
  diagnostics.runSettled(identity, 'failure', 64, 'RUN_STEP_LIMIT', 'step_limit')
  expect(events[0]).toMatchObject({ event: 'run.settled', errorCode: 'RUN_STEP_LIMIT', phase: 'step_limit' })
  expect(JSON.stringify(events)).not.toContain('Run reached the 64-step limit')
  expect(diagnosticEventSchema.safeParse(events[0]).success).toBe(true)
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

for (const protocol of ['openai-completions', 'openai-responses'] as const) {
  for (const httpStatus of [200, 502] as const) {
    test(`real Kernel retains one provider failure with HTTP ${httpStatus} for ${protocol}`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-execution-provider-'))
      const events: DiagnosticEvent[] = []
      let requests = 0
      const provider = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch() {
          requests += 1
          return httpStatus === 200
            ? new Response('data: {not-json}\n\n', {
                headers: { 'content-type': 'text/event-stream', 'x-request-id': 'private-request-canary' },
              })
            : Response.json(
                { error: { message: 'private-error-canary' } },
                { status: httpStatus, headers: { 'x-request-id': 'private-request-canary' } },
              )
        },
      })
      let kernel: Kernel | undefined
      try {
        kernel = await Kernel.create({
          home: join(root, 'data'),
          workspace: root,
          secrets: new MemorySecrets(),
          diagnostics: collector(events),
        })
        await kernel.saveProvider(
          {
            id: 'catalog',
            name: 'Diagnostic fixture',
            protocol,
            baseUrl: `http://127.0.0.1:${provider.port}/v1`,
            model: 'selected',
            contextWindow: 4096,
            maxOutput: 512,
            models: [{ id: 'selected' }],
          },
          'private-key-canary',
        )
        const workspace = (await kernel.storage.call('workspaces'))[0]
        if (!workspace) throw new Error('Provider diagnostics fixture workspace missing')
        const session = await kernel.createSession(workspace.id)
        const run = await kernel.submit(
          session.id,
          'provider-terminal-failure',
          { text: 'private-prompt-canary', images: [] },
          'catalog/selected',
        )
        await kernel.waitForIdle()
        expect((await kernel.storage.call('run', run.id)).status).toBe('failed')
        const own = events.filter((event) => event.runId === run.id)
        const terminals = own.filter((event) => event.event === 'provider.request_settled')
        const failed = own.filter((event) => event.event === 'model.failed')
        expect(requests).toBe(1)
        expect(terminals).toHaveLength(1)
        expect(failed).toHaveLength(1)
        for (const event of [...terminals, ...failed]) {
          expect(event).toMatchObject({
            httpStatus,
            protocol,
            outcome: 'failure',
            failureKind: httpStatus === 200 ? 'stream' : 'http',
            failurePhase: httpStatus === 200 ? 'stream' : 'response',
            errorCode: httpStatus === 200 ? 'PROVIDER_STREAM_INTERRUPTED' : 'PROVIDER_HTTP_ERROR',
          })
          expect(event.upstreamRequestIdSha256).toMatch(/^[a-f0-9]{64}$/)
          expect(diagnosticEventSchema.safeParse(event).success).toBe(true)
        }
        expect(failed[0]?.modelRequestId).toBe(terminals[0]?.modelRequestId)
        expect(failed[0]?.stepId).toBe(terminals[0]?.modelRequestId)
        const history = await kernel.storage.call('events', session.id, 0, 2000)
        const durableSteps = history.filter((event) => event.runId === run.id && event.type === 'step.ended')
        expect(own.filter((event) => event.event === 'model.settled')).toHaveLength(durableSteps.length)
        const serialized = JSON.stringify(own)
        for (const canary of [
          'private-prompt-canary',
          'private-key-canary',
          'private-error-canary',
          'private-request-canary',
        ])
          expect(serialized).not.toContain(canary)
      } finally {
        await kernel?.close()
        await provider.stop(true)
        await removeFixture(root)
      }
    }, 20_000)
  }
}

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
  const entered = diagnosticGate()
  const gate = diagnosticGate()
  kernel.tools.register({
    name: 'diagnostic_scope_gate',
    description: 'Gate the first Run until its successor is durably queued',
    effect: 'read',
    inputSchema: z.object({}),
    async execute(_args, context) {
      context.signal.throwIfAborted()
      entered.release()
      const releaseOnAbort = (): void => gate.release()
      context.signal.addEventListener('abort', releaseOnAbort, { once: true })
      try {
        await gate.promise
        context.signal.throwIfAborted()
        return { text: 'gate released' }
      } finally {
        context.signal.removeEventListener('abort', releaseOnAbort)
      }
    },
  })
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Kernel fixture did not create a workspace')
    const session = await kernel.createSession(workspace.id)
    const runs = await scope.run({ rpcId: 'rpc-admission' }, async () => {
      const first = await kernel.submit(
        session.id,
        'queued-first',
        { text: '/tool diagnostic_scope_gate {}', images: [], approval: 'allow' },
        'local-fixture',
      )
      const second = await kernel.submit(session.id, 'queued-second', { text: 'hello', images: [] }, 'local-fixture')
      return [first, second]
    })
    await entered.promise
    expect(kernel.active.get(session.id)?.run.id).toBe(runs[0]?.id)
    const queued = runs[1]
    if (!queued) throw new Error('Queued diagnostics fixture did not submit a successor')
    expect((await kernel.storage.call('run', queued.id)).status).toBe('queued')
    gate.release()
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
    gate.release()
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
