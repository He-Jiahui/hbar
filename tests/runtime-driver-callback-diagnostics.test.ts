import { expect, test } from 'bun:test'
import { z } from 'zod'
import { diagnosticEventSchema, providerSchema, type DiagnosticEvent } from '@hbar/contracts'
import { IpcPeer, procedure, RuntimeCoordinator } from '@hbar/runtime'
import { runtimeDriverStartSchema, runtimeDriverCallbackSchema } from '@hbar/plugin-sdk/runtime-driver'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { RuntimeDriverRelay } from '../apps/host/src/runtime-driver-relay'
import { RuntimeDriverCallbackAdmission } from '../apps/host/src/runtime-driver-callback-gate'
import { observeDriverCallback } from '../apps/host/src/runtime-driver-callback-diagnostics'
function deferred() {
  let resolve: () => void = () => {
    throw new Error('Fixture not initialized')
  }
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, release: () => resolve() }
}
function result(operation: Promise<unknown>) {
  return operation.then(
    (value) => ({ ok: true, value }),
    (value: unknown) => ({ ok: false, value }),
  )
}
async function until(check: () => boolean) {
  const end = Date.now() + 2000
  while (!check()) {
    if (Date.now() >= end) throw new Error('Diagnostic fixture deadline')
    await Bun.sleep(1)
  }
}
function peers(capacity = 32, failSend = false, unitId = 'driver.pi') {
  const owner = { unitId, generation: 1, incarnation: crypto.randomUUID() },
    remote = { unitId: 'base', generation: 1, incarnation: crypto.randomUUID() }
  let right: IpcPeer | undefined
  const left = new IpcPeer({
    owner,
    remote,
    inFlight: capacity,
    queued: 128,
    transport: {
      send(frame) {
        if (failSend) throw new Error('SEND_CANARY')
        if (!right) throw new Error('Missing fixture peer')
        right.receive(frame)
      },
    },
  })
  right = new IpcPeer({
    owner: remote,
    remote: owner,
    inFlight: capacity,
    queued: 128,
    transport: { send: (frame) => left.receive(frame) },
  })
  return {
    left,
    right,
    owner,
    close() {
      left.close()
      right?.close()
    },
  }
}
const runId = crypto.randomUUID(),
  sessionId = crypto.randomUUID()
function callback(
  pair: ReturnType<typeof peers>,
  admission: RuntimeDriverCallbackAdmission,
  events: DiagnosticEvent[],
  timeoutMs: number,
  signal = new AbortController().signal,
) {
  return observeDriverCallback({
    side: 'source',
    owner: pair.owner,
    rpcId: crypto.randomUUID(),
    invocationId: crypto.randomUUID(),
    runId,
    sessionId,
    method: 'readFile',
    emit: (event) => events.push(event),
    operation: (observe) =>
      admission.run(
        'readFile',
        signal,
        timeoutMs,
        (options) => pair.left.call('callback', { canary: 'PAYLOAD_CANARY' }, z.undefined(), { ...options, signal }),
        observe,
      ),
  })
}
test('admission queue timeout never reports a transport submission and keeps exact scalar correlation', async () => {
  const pair = peers(),
    admission = new RuntimeDriverCallbackAdmission(),
    held = deferred(),
    events: DiagnosticEvent[] = []
  let received = 0
  pair.right.register(
    'callback',
    procedure(z.unknown(), z.undefined(), async () => {
      received++
      await held.promise
    }),
  )
  const active = Array.from({ length: 6 }, () => result(callback(pair, admission, [], 2000)))
  try {
    await until(() => received === 6)
    const expired = await result(callback(pair, admission, events, 30))
    expect(expired.value).toMatchObject({ code: 'IPC_TIMEOUT' })
    expect(events.some((event) => event.phase === 'source_waiting')).toBe(true)
    expect(events.some((event) => event.phase === 'source_granted')).toBe(false)
    expect(events.some((event) => event.phase?.includes('transport_'))).toBe(false)
    expect(events.find((event) => event.phase === 'source_logical_settled')).toMatchObject({
      runId,
      sessionId,
      method: 'driver.callback.readFile',
      admissionLane: 'recursive',
      callbackStage: 'waiting',
      admissionActive: 6,
      errorCode: 'IPC_TIMEOUT',
      remainingBudgetMs: 0,
    })
    expect(received).toBe(6)
    for (const event of events) expect(diagnosticEventSchema.safeParse(event).success).toBe(true)
    expect(JSON.stringify(events)).not.toContain('PAYLOAD_CANARY')
  } finally {
    held.release()
    await Promise.all(active)
    admission.close()
    pair.close()
  }
})
test('peer queue timeout is granted locally but not submitted to transport or fenced', async () => {
  const pair = peers(1),
    admission = new RuntimeDriverCallbackAdmission(),
    held = deferred(),
    entered = deferred(),
    events: DiagnosticEvent[] = []
  pair.right.register(
    'callback',
    procedure(z.unknown(), z.undefined(), async () => {
      entered.release()
      await held.promise
    }),
  )
  const first = result(pair.left.call('callback', undefined, z.undefined()))
  try {
    await entered.promise
    const expired = await result(callback(pair, admission, events, 30))
    expect(expired.value).toMatchObject({ code: 'IPC_TIMEOUT' })
    expect(events.some((event) => event.phase === 'source_granted')).toBe(true)
    expect(events.some((event) => event.phase === 'source_not_dispatched')).toBe(true)
    expect(events.some((event) => event.phase?.includes('transport_'))).toBe(false)
    expect(events.find((event) => event.phase === 'source_logical_settled')).toMatchObject({
      callbackStage: 'granted',
      errorCode: 'IPC_TIMEOUT',
    })
    expect(admission.snapshot().recursive).toMatchObject({ active: 0, unconfirmed: 0, fenced: false })
    expect(pair.left.snapshot().inFlight).toBe(1)
  } finally {
    held.release()
    await first
    admission.close()
    pair.close()
  }
})
for (const mode of ['timeout', 'cancel'] as const)
  test('submitted ' + mode + ' does not report physical completion before the late real reply', async () => {
    const pair = peers(),
      admission = new RuntimeDriverCallbackAdmission(),
      held = deferred(),
      entered = deferred(),
      abort = new AbortController(),
      events: DiagnosticEvent[] = []
    pair.right.register(
      'callback',
      procedure(z.unknown(), z.undefined(), async () => {
        entered.release()
        await held.promise
      }),
    )
    const call = result(callback(pair, admission, events, mode === 'timeout' ? 40 : 2000, abort.signal))
    try {
      await entered.promise
      if (mode === 'cancel') abort.abort()
      expect((await call).value).toMatchObject({ code: mode === 'cancel' ? 'IPC_CANCELLED' : 'IPC_TIMEOUT' })
      expect(events.some((event) => event.phase === 'source_transport_submitting')).toBe(true)
      expect(events.some((event) => event.phase === 'source_transport_sent')).toBe(true)
      expect(events.some((event) => event.phase === 'source_physical_reply')).toBe(false)
      expect(admission.snapshot().recursive).toMatchObject({ active: 1, unconfirmed: 1, fenced: mode === 'timeout' })
      held.release()
      await until(() => events.some((event) => event.phase === 'source_physical_reply'))
      expect(admission.snapshot().recursive).toMatchObject({ active: 0, unconfirmed: 0 })
      expect(events.find((event) => event.phase === 'source_physical_reply')).toMatchObject({
        admissionActive: 0,
        admissionUnconfirmed: 0,
      })
      expect(JSON.stringify(events)).not.toContain('PAYLOAD_CANARY')
    } finally {
      held.release()
      await call
      admission.close()
      pair.close()
    }
  })
test('local transport failure is distinct from sent and observer exceptions cannot replace the failure', async () => {
  const pair = peers(32, true),
    admission = new RuntimeDriverCallbackAdmission(),
    events: DiagnosticEvent[] = []
  try {
    const failed = await result(callback(pair, admission, events, 2000))
    expect(failed.ok).toBe(false)
    await until(() => events.some((event) => event.phase === 'source_transport_send_failed'))
    expect(events.some((event) => event.phase === 'source_transport_submitting')).toBe(true)
    expect(events.some((event) => event.phase === 'source_transport_sent')).toBe(false)
    expect(admission.snapshot().recursive).toMatchObject({ active: 1, unconfirmed: 1, fenced: true })
    expect(JSON.stringify(events)).not.toContain('SEND_CANARY')
    const observed = await result(
      observeDriverCallback({
        side: 'relay',
        owner: pair.owner,
        rpcId: crypto.randomUUID(),
        invocationId: crypto.randomUUID(),
        runId,
        sessionId,
        method: 'emit',
        emit() {
          throw new Error('OBSERVER_CANARY')
        },
        operation: () => Promise.resolve(42),
      }),
    )
    expect(observed).toEqual({ ok: true, value: 42 })
  } finally {
    admission.close()
    pair.close()
  }
})
test('a synchronous throwing transport observer cannot stop a real successful IPC reply', async () => {
  const pair = peers()
  pair.right.register(
    'ok',
    procedure(z.undefined(), z.number(), () => 7),
  )
  try {
    const value = await pair.left.call('ok', undefined, z.number(), {
      onDispatchStarted() {
        throw new Error('OBSERVER_CANARY')
      },
    })
    expect(value).toBe(7)
    expect(pair.left.snapshot().inFlight).toBe(0)
  } finally {
    pair.close()
  }
})

for (const retire of ['abort', 'close'] as const) {
  test(`submitting observer synchronous ${retire} retires before transport and never executes remote handler`, async () => {
    const pair = peers(),
      controller = new AbortController(),
      admission = new RuntimeDriverCallbackAdmission()
    const settlements: string[] = [],
      stages: string[] = []
    let handled = 0
    pair.right.register(
      'callback',
      procedure(z.undefined(), z.undefined(), () => {
        handled++
      }),
    )
    try {
      const operation = await result(
        admission.run('readFile', controller.signal, 2000, (options) =>
          pair.left.call('callback', undefined, z.undefined(), {
            ...options,
            signal: controller.signal,
            onDispatchStarted(stage) {
              stages.push(stage)
              options.onDispatchStarted(stage)
              if (stage === 'submitting') {
                if (retire === 'abort') controller.abort(new Error('OBSERVER_ABORT'))
                else pair.left.close()
              }
            },
            onDispatchSettled(event) {
              settlements.push(event)
              options.onDispatchSettled(event)
            },
          }),
        ),
      )
      expect(operation.ok).toBe(false)
      expect(handled).toBe(0)
      expect(stages).toEqual(['submitting'])
      expect(settlements).toEqual(['not-dispatched'])
      expect(pair.left.snapshot().inFlight).toBe(0)
      expect(admission.snapshot().active).toBe(0)
      expect(admission.snapshot().recursive.unconfirmed).toBe(0)
      expect(admission.snapshot().leaf.unconfirmed).toBe(0)
    } finally {
      admission.close()
      pair.close()
    }
  })
}

test('real relay attaches exact execution Run/session and preserves caller RPC identity through submission', async () => {
  const kernel = peers(32, false, 'kernel'),
    driver = peers(),
    events: DiagnosticEvent[] = []
  const version = (owner: RuntimeOwner) => ({
    unitId: owner.unitId,
    generation: owner.generation,
    artifactId: 'a'.repeat(64),
  })
  const coordinator = new RuntimeCoordinator({
    claim: (lease) => Promise.resolve(lease),
    release: () => Promise.resolve(),
    revoke: () => Promise.resolve(),
  })
  for (const entry of [kernel, driver]) {
    coordinator.register(entry.owner, version(entry.owner), {
      id: entry.owner.unitId,
      kind: entry === kernel ? 'kernel' : 'driver',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 24,
    })
    coordinator.activate(entry.owner)
  }
  const relay = new RuntimeDriverRelay({
    coordinator,
    onDiagnostic: (event) => events.push(event),
    resolve: () => ({ owner: driver.owner, version: version(driver.owner), peer: driver.right }),
  })
  const detach = [relay.attachKernel(kernel.right), relay.attachDriver(driver.right)]
  driver.left.register(
    'driver.start',
    procedure(runtimeDriverStartSchema, z.object({ invocationId: z.string() }), (input) => ({
      invocationId: input.invocationId,
    })),
  )
  kernel.left.register(
    'driver.callback',
    procedure(runtimeDriverCallbackSchema, z.null(), () => null),
  )
  try {
    const ownership = await coordinator.claim(kernel.owner, sessionId, runId, {
      kernel: version(kernel.owner),
      driver: version(driver.owner),
      plugins: [],
      hooks: [],
    })
    if (!ownership) throw new Error('Fixture ownership unavailable')
    const invocationId = crypto.randomUUID(),
      rpcId = crypto.randomUUID()
    const input = runtimeDriverStartSchema.parse({
      invocationId,
      ownership,
      apiKey: null,
      steering: false,
      tools: [],
      workspace: { id: 'workspace', path: process.cwd(), name: 'Fixture', createdAt: 1 },
      session: {
        id: sessionId,
        workspaceId: 'workspace',
        title: 'Fixture',
        archived: false,
        parentId: null,
        createdAt: 1,
        updatedAt: 1,
        seq: 0,
      },
      run: {
        id: runId,
        sessionId,
        requestId: crypto.randomUUID(),
        input: { text: 'REQUEST_CANARY', images: [] },
        modelId: 'fixture',
        status: 'running',
        createdAt: 1,
        startedAt: 1,
        endedAt: null,
        error: null,
      },
      request: {
        system: 'SYSTEM_CANARY',
        model: providerSchema.parse({
          id: 'fixture',
          name: 'Fixture',
          protocol: 'mock',
          model: 'fixture',
          baseUrl: 'http://127.0.0.1',
        }),
        messages: [],
      },
    })
    await kernel.left.call('driver.start', input, z.object({ invocationId: z.string() }))
    const value = await driver.left.call(
      'driver.callback',
      { invocationId, method: 'resolveKey', modelId: 'MODEL_CANARY' },
      z.null(),
      { requestId: rpcId },
    )
    expect(value).toBeNull()
    expect(events.find((event) => event.phase === 'relay_transport_submitting')).toMatchObject({
      rpcId,
      callId: invocationId,
      runId,
      sessionId,
      contextId: 'kernel',
      requestId: kernel.owner.incarnation,
      method: 'driver.callback.resolveKey',
      admissionLane: 'recursive',
      callbackStage: 'transport_submitting',
    })
    expect(events.some((event) => event.phase === 'relay_physical_reply')).toBe(true)
    const text = JSON.stringify(events)
    for (const canary of ['REQUEST_CANARY', 'SYSTEM_CANARY', 'MODEL_CANARY']) expect(text).not.toContain(canary)
  } finally {
    relay.kernelExited(kernel.owner)
    relay.driverExited(driver.owner)
    for (const dispose of detach) dispose()
    kernel.close()
    driver.close()
  }
})

for (const phase of ['waiting', 'granted'] as const)
  test('synchronous admission ' + phase + ' observer abort cannot dispatch or leak a queued permit', async () => {
    const pair = peers(),
      admission = new RuntimeDriverCallbackAdmission(),
      held = deferred(),
      abort = new AbortController(),
      reason = new Error('Fixed fixture cancellation')
    let received = 0
    pair.right.register(
      'callback',
      procedure(z.undefined(), z.undefined(), async () => {
        received++
        await held.promise
      }),
    )
    const active =
      phase === 'waiting'
        ? Array.from({ length: 6 }, () =>
            result(
              admission.run('readFile', new AbortController().signal, 2000, (options) =>
                pair.left.call('callback', undefined, z.undefined(), options),
              ),
            ),
          )
        : []
    try {
      if (phase === 'waiting') await until(() => received === 6)
      const pending = result(
        admission.run(
          'readFile',
          abort.signal,
          2000,
          (options) => pair.left.call('callback', undefined, z.undefined(), { ...options, signal: abort.signal }),
          (event) => {
            if (event.phase === phase) abort.abort(reason)
          },
        ),
      )
      expect((await pending).value).toBe(reason)
      expect(received).toBe(phase === 'waiting' ? 6 : 0)
      expect(admission.snapshot().recursive).toMatchObject({
        queued: 0,
        active: phase === 'waiting' ? 6 : 0,
        unconfirmed: 0,
        fenced: false,
      })
    } finally {
      held.release()
      await Promise.all(active)
      admission.close()
      pair.close()
    }
  })
