import { expect, test } from 'bun:test'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { IpcPeer, RuntimeCoordinator, procedure } from '@hbar/runtime'
import type { RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import { HbarError, providerSchema } from '@hbar/contracts'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { CONTEXT_COMPACTION_RPC_TIMEOUT_MS } from '@hbar/contracts/commands/run'
import type { DiagnosticEvent } from '@hbar/contracts/diagnostics'
import {
  runtimeDriverStartSchema,
  runtimeDriverCallbackSchema,
  runtimeDriverCancelSchema,
} from '@hbar/plugin-sdk/runtime-driver'
import type { RuntimeDriverCallbackValue } from '@hbar/plugin-sdk/runtime-driver'
import { RuntimeDriverRelay } from '../apps/host/src/runtime-driver-relay'
import { driverCallbackTimeoutMs } from '../apps/host/src/runtime-driver-timeouts'
import { driverCallbackCorrelation, observeDriverCallback } from '../apps/host/src/runtime-driver-callback-diagnostics'
import { createBoundedCompactionSignal } from '../packages/kernel/src/compaction-timeout'
import { DRIVER_RUNTIME_FINGERPRINT } from '../apps/host/src/runtime-driver-contract'

function paired(owner: RuntimeOwner, remote: RuntimeOwner) {
  let unit: IpcPeer | undefined
  const host = new IpcPeer({ owner, remote, transport: { send: (frame) => unit?.receive(frame) } })
  unit = new IpcPeer({ owner: remote, remote: owner, transport: { send: (frame) => host.receive(frame) } })
  return { host, unit }
}

async function fixture(
  handler: (input: z.output<typeof runtimeDriverCallbackSchema>, signal: AbortSignal) => Promise<unknown>,
) {
  const owner = (unitId: string): RuntimeOwner => ({ unitId, generation: 1, incarnation: crypto.randomUUID() })
  const base = owner('base'),
    kernel = owner('kernel'),
    driver = owner('driver.pi')
  const version = (value: RuntimeOwner): RuntimeVersion => ({
    unitId: value.unitId,
    generation: 1,
    artifactId: 'a'.repeat(64),
  })
  const coordinator = new RuntimeCoordinator({
    claim: async (lease) => lease,
    release: async () => {},
    revoke: async () => {},
  })
  for (const value of [kernel, driver]) {
    coordinator.register(value, version(value), {
      id: value.unitId,
      kind: value === kernel ? 'kernel' : 'driver',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: STORAGE_SCHEMA_VERSION,
    })
    coordinator.activate(value)
  }
  const kernels = paired(base, kernel),
    drivers = paired(base, driver)
  const events: DiagnosticEvent[] = []
  const relay = new RuntimeDriverRelay({
    coordinator,
    resolve: () => ({ owner: driver, version: version(driver), peer: drivers.host }),
    onDiagnostic: (event) => {
      events.push(event)
    },
  })
  const detach = [relay.attachKernel(kernels.host), relay.attachDriver(drivers.host)]
  let observeCancel: (() => void) | undefined
  const cancelObserved = new Promise<void>((resolve) => {
    observeCancel = resolve
  })
  drivers.unit.onEvent('driver.cancel', runtimeDriverCancelSchema, () => {
    observeCancel?.()
  })
  drivers.unit.register(
    'driver.start',
    procedure(runtimeDriverStartSchema, z.strictObject({ invocationId: z.string() }), (input) => ({
      invocationId: input.invocationId,
    })),
  )
  kernels.unit.register(
    'driver.callback',
    procedure(runtimeDriverCallbackSchema, z.unknown(), (input, call) => handler(input, call.signal)),
  )
  const invocationId = crypto.randomUUID(),
    sessionId = crypto.randomUUID(),
    runId = crypto.randomUUID()
  const ownership = await coordinator.claim(kernel, sessionId, runId, {
    kernel: version(kernel),
    driver: version(driver),
    plugins: [],
    hooks: [],
  })
  if (!ownership) throw new Error('Fixture execution admission missing')
  const model = providerSchema.parse({
    id: 'fixture',
    name: 'Fixture',
    protocol: 'mock',
    model: 'fixture',
    baseUrl: 'https://example.invalid',
  })
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
      input: { text: 'private-payload-canary', images: [] },
      modelId: model.id,
      status: 'running',
      createdAt: 1,
      startedAt: 1,
      endedAt: null,
      error: null,
    },
    request: { system: 'private-context-canary', model, messages: [] },
  })
  await kernels.unit.call('driver.start', input, z.unknown())
  return {
    events,
    async cancel() {
      await kernels.unit.notify('driver.cancel', { invocationId, reasonCode: 'USER_CANCELLED' })
      await cancelObserved
    },
    call(value: RuntimeDriverCallbackValue, signal?: AbortSignal) {
      const rpcId = driverCallbackCorrelation()
      return observeDriverCallback({
        side: 'source',
        owner: driver,
        rpcId,
        invocationId,
        method: value.method,
        emit: (event) => {
          events.push(event)
        },
        operation: () =>
          drivers.unit.call('driver.callback', { invocationId, ...value }, z.unknown(), {
            signal,
            ownership,
            requestId: rpcId,
            timeoutMs: driverCallbackTimeoutMs(value.method),
          }),
      })
    },
    close() {
      for (const dispose of detach) dispose()
      kernels.host.close()
      kernels.unit.close()
      drivers.host.close()
      drivers.unit.close()
    },
  }
}
const rejected = (operation: Promise<unknown>) => operation.catch((error: unknown) => error)

test('real two-hop stepEnded survives the old 30-second boundary while neighbor callbacks and cancellation respond', async () => {
  let entered: (() => void) | undefined
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const f = await fixture(async (input, signal) => {
    if (input.method === 'stepEnded') {
      entered?.()
      await Bun.sleep(31_000)
      signal.throwIfAborted()
      return { stop: 'goal_complete' }
    }
    if (input.method === 'readFile')
      return new Promise<never>((_resolve, reject) => {
        const abort = () => reject(new HbarError('INNER_CANCELLED', 'Fixture callback cancelled'))
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      })
    return 'neighbor'
  })
  const delayed = f.call({ method: 'stepEnded', stepId: 'fixture-step' })
  // Attach immediately so the old implementation's 30-second failure remains handled.
  const delayedOutcome = rejected(delayed)
  try {
    await started
    expect(await f.call({ method: 'resolveKey', modelId: 'fixture' })).toBe('neighbor')
    await f.cancel()
    const controller = new AbortController()
    const cancelled = rejected(f.call({ method: 'readFile', id: 'private-file-canary' }, controller.signal))
    controller.abort()
    expect(await cancelled).toMatchObject({ code: 'IPC_CANCELLED' })
    expect(await delayedOutcome).toEqual({ stop: 'goal_complete' })
    expect(
      f.events.some(
        (event) =>
          event.phase === 'relay_settled' &&
          event.method === 'driver.callback.stepEnded' &&
          event.outcome === 'success',
      ),
    ).toBe(true)
    const start = f.events.find(
      (event) => event.phase === 'source_started' && event.method === 'driver.callback.stepEnded',
    )
    expect(f.events.some((event) => event.phase === 'relay_started' && event.rpcId === start?.rpcId)).toBe(true)
    expect(JSON.stringify(f.events)).not.toContain('private-')
  } finally {
    f.close()
  }
}, 45_000)

test('Kernel bounded compaction failure wins over both routing budgets without discarding the domain error', async () => {
  const f = await fixture(async (_input, parent) => {
    const bounded = createBoundedCompactionSignal(parent, 25)
    try {
      return await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(bounded.signal.reason)
        if (bounded.signal.aborted) abort()
        else bounded.signal.addEventListener('abort', abort, { once: true })
      })
    } finally {
      bounded.dispose()
    }
  })
  try {
    expect(await rejected(f.call({ method: 'stepEnded', stepId: 'fixture' }))).toMatchObject({
      code: 'COMPACTION_TIMEOUT',
    })
    expect(f.events.some((event) => event.errorCode === 'IPC_TIMEOUT')).toBe(false)
  } finally {
    f.close()
  }
})

test('only compaction-capable callbacks receive the existing bounded RPC budget; observers cannot change outcomes', async () => {
  const previousFingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        z.toJSONSchema(runtimeDriverStartSchema, { io: 'input' }),
        z.toJSONSchema(runtimeDriverCallbackSchema, { io: 'input' }),
      ]),
    )
    .digest('hex')
  expect(DRIVER_RUNTIME_FINGERPRINT).not.toBe(previousFingerprint)
  expect(driverCallbackTimeoutMs('stepEnded')).toBe(CONTEXT_COMPACTION_RPC_TIMEOUT_MS)
  expect(driverCallbackTimeoutMs('beforeRequest')).toBe(CONTEXT_COMPACTION_RPC_TIMEOUT_MS)
  expect(driverCallbackTimeoutMs('execute')).toBe(2_147_483_647)
  for (const method of [
    'emit',
    'commit',
    'modelDiagnostic',
    'resolveKey',
    'readImage',
    'readFile',
    'steering',
    'closeSteering',
  ] as const)
    expect(driverCallbackTimeoutMs(method)).toBe(30_000)
  const sentinel = new HbarError('IPC_TIMEOUT', 'private-error-canary')
  const events: DiagnosticEvent[] = []
  expect(
    await rejected(
      observeDriverCallback({
        side: 'relay',
        owner: { unitId: 'kernel', generation: 1, incarnation: crypto.randomUUID() },
        rpcId: 'private-request-canary',
        invocationId: 'private-invocation-canary',
        method: 'commit',
        emit: (event) => {
          events.push(event)
          throw new Error('private-observer-canary')
        },
        operation: () => Promise.reject(sentinel),
      }),
    ),
  ).toBe(sentinel)
  expect(events[1]).toMatchObject({ method: 'driver.callback.commit', errorCode: 'IPC_TIMEOUT' })
  expect(JSON.stringify(events)).not.toContain('private-')
})
