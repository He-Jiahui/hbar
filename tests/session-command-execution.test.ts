import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { CommandError, CommandRegistry, createCommandRouter, defineCommand } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { HbarError } from '@hbar/contracts'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import type { ArtifactRef } from '@hbar/contracts'
import { Storage } from '@hbar/storage'
import { HostCommandExecutionScopes } from '../apps/host/src/command-execution-scopes'
import { LocalCommandJobs } from '../apps/host/src/local-command-jobs'
import { CommandResultPayloads } from '../apps/host/src/command-result-payloads'
import { SessionCommandExecution } from '../apps/host/src/session-command-execution'
import type { RuntimeCommandJobTicket } from '../apps/host/src/runtime-command-jobs'
import { removeOwnedTestDirectory } from './owned-temp-directory'

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {
    throw new Error('Not initialized')
  }
  const promise = new Promise<Value>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected execution rejection')
}
async function fixture(
  options: {
    timeoutMs?: number
    result?: unknown
    scoped?: boolean
    failAcknowledgments?: number
    invalidAcknowledgment?: boolean
    maxTrackingMs?: number
    failPayloadWrites?: number
  } = {},
) {
  const prefix = 'hbar-session-command-execution-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'allowed')
  const forbidden = await storage.call('createWorkspace', join(root, 'other'), 'forbidden')
  const device = {
    id: 'source-actor',
    name: 'Source',
    createdAt: 1,
    lastSeenAt: 1,
    role: 'operator' as const,
    workspaceIds: options.scoped ? [workspace.id] : null,
  }
  await storage.call('putDevice', device, 'fixture-token-hash')
  const session = await storage.call('createSessionCommand', {
    workspaceId: workspace.id,
    actorId: device.id,
    idempotencyKey: 'create',
  })
  const run = await storage.call('enqueue', session.id, 'source', { text: 'execute once', images: [] }, 'fixture')
  await storage.call('claim', session.id)
  const source: ExecutionOwnership = {
    leaseId: 'source-lease',
    sessionId: session.id,
    runId: run.id,
    fence: 1,
    acquiredAt: 1,
    owner: { unitId: 'kernel', generation: 1, incarnation: 'kernel-fixture' },
    versions: {
      kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) },
      driver: { unitId: 'driver', generation: 1, artifactId: 'b'.repeat(64) },
      plugins: [],
      hooks: [],
    },
  }
  const scopes = new HostCommandExecutionScopes(),
    gate = deferred<void>(),
    entered = deferred<void>()
  let writes = 0,
    resources = 0,
    acknowledged = 0
  let failingAcknowledgments = options.failAcknowledgments ?? 0
  let failingPayloadWrites = options.failPayloadWrites ?? 0
  const registry = new CommandRegistry({ execution: 'host' })
  const definition = defineCommand(
    {
      id: 'fixture.write',
      version: 1,
      owner: 'fixture',
      execution: 'host',
      kind: 'command',
      stateEffect: 'persistent',
      scope: 'session',
      category: 'fixture',
      titleKey: 'fixture',
      descriptionKey: 'fixture',
      surfaces: ['api'],
      timeoutMs: options.timeoutMs ?? 30_000,
      idempotency: 'required',
    },
    z.strictObject({ sessionId: z.string(), text: z.string().default('proof') }),
    z.unknown(),
  )
  registry.register(
    definition,
    async (input) => {
      expect(
        (
          await storage.call('commandExecutionRead', {
            sessionId: session.id,
            actorId: device.id,
            operationKey: 'write-once',
          })
        )?.owner,
      ).toMatchObject({ kind: 'host', instanceId: jobs.instanceId })
      entered.resolve()
      await gate.promise
      writes++
      return Object.hasOwn(options, 'result') ? options.result : { text: input.text }
    },
    { durable: true },
  )
  registry.register(directoryCommands['workspace.list'], async () => ({
    items: [workspace, forbidden],
    nextCursor: null,
  }))
  const jobs = new LocalCommandJobs({
    scopes,
    ...(options.maxTrackingMs ? { maxTrackingMs: options.maxTrackingMs } : {}),
    retainSource: () => {
      resources++
      return () => {
        resources--
      }
    },
  })
  const routing = createCommandRouter({
    catalogs: () => [registry.list()],
    resolve: (id) => {
      if (!registry.list().items.some((item) => item.metadata.id === id)) return undefined
      return {
        list: () => registry.list(),
        describe: () => registry.describe(id),
        prepare: (value) => registry.prepare(value),
        dispatch: (value, actorId) => registry.dispatch(value, { actorId }),
        dispatchPrepared: registry.dispatchPrepared.bind(registry),
        dispatchPreparedTracked: (value, actorId, expectation, callOptions) => {
          const ticket = jobs.execute(
            actorId,
            (signal) => registry.dispatchPreparedTracked(value, actorId, expectation, { signal }),
            { signal: callOptions?.signal },
          )
          return observe(ticket)
        },
      }
    },
  })
  function observe(ticket: RuntimeCommandJobTicket): RuntimeCommandJobTicket {
    return {
      ...ticket,
      follow: (options) => observe(ticket.follow(options)),
      acknowledge: async () => {
        acknowledged++
        if (failingAcknowledgments-- > 0)
          throw new CommandError(
            options.invalidAcknowledgment ? 'COMMAND_JOB_INVALID' : 'IPC_DISCONNECTED',
            'The retained acknowledgment needs reconciliation',
          )
        await ticket.acknowledge()
      },
    }
  }
  const data = new Map<string, Uint8Array>()
  const released: string[] = []
  const payloads = new CommandResultPayloads({
    write: async (_identity, index, bytes) => {
      if (failingPayloadWrites-- > 0) throw new HbarError('STORAGE_ERROR', 'Attachment publication failed')
      const id = createHash('sha256').update(bytes).digest('hex')
      const artifact: ArtifactRef = {
        id,
        name: `result-${index}.json`,
        mime: 'application/octet-stream',
        size: bytes.byteLength,
      }
      data.set(id, bytes.slice())
      await storage.call('putArtifact', artifact)
      return artifact
    },
    read: (artifact) => {
      const bytes = data.get(artifact.id)
      if (!bytes) return Promise.reject(new Error('Missing test attachment'))
      return Promise.resolve(bytes.slice())
    },
    release: async (source, artifact) => {
      const receipt = await storage.call('commandExecutionRead', {
        sessionId: source.sessionId,
        actorId: source.actorId,
        operationKey: source.operationKey,
      })
      const saved = source.channel === 'logical' ? receipt?.logical : receipt?.physical?.payload
      expect(saved?.kind).toBe('artifacts')
      if (saved?.kind === 'artifacts') expect(saved.chunks.some((chunk) => chunk.id === artifact.id)).toBe(true)
      released.push(`${source.channel}:${artifact.id}`)
    },
  })
  const createService = () =>
    new SessionCommandExecution({
      storage,
      routing,
      scopes,
      payloads,
      assertSource: (actual) => {
        expect(actual).toEqual(source)
      },
    })
  const service = createService()
  const prepared = await routing.prepare({
    protocol: 1,
    requestId: 'source-command',
    commandId: 'fixture.write',
    commandVersion: 1,
    idempotencyKey: 'write-once',
    input: { sessionId: session.id },
  })
  const request = { source, callId: 'source-call', operationKey: 'write-once', prepared }
  return {
    storage,
    root,
    device,
    workspace,
    forbidden,
    session,
    run,
    source,
    service,
    createService,
    jobs,
    payloads,
    data,
    released,
    gate,
    entered,
    request,
    routing,
    counts: () => ({ writes, resources, acknowledged }),
    async close() {
      gate.resolve()
      if (!(await storage.call('deviceById', device.id)))
        await storage.call('putDevice', device, 'fixture-restored-token-hash')
      await service.reconcile(session.id, run.id, request.operationKey)
      jobs.dispose()
      registry.dispose()
      await storage.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('persistent session commands bind before effects, coalesce duplicate calls, and save late settlement before acknowledging', async () => {
  const f = await fixture({ timeoutMs: 15 })
  try {
    const first = f.service.execute(f.request)
    await f.entered.promise
    const duplicate = f.service.execute({
      ...f.request,
      callId: 'duplicate-call',
      prepared: { ...f.request.prepared, invocation: { ...f.request.prepared.invocation, requestId: 'new-request' } },
    })
    const logical = await first
    expect(await duplicate).toMatchObject({ operationKey: logical.operationKey, inputHash: logical.inputHash })
    expect(logical.logical?.kind).toBe('inline')
    expect(logical.logical && (await f.payloads.read(logical.logical))).toMatchObject({
      ok: false,
      error: { code: 'RESULT_UNKNOWN' },
    })
    expect(logical.physical).toBeNull()
    expect(f.counts()).toEqual({ writes: 0, resources: 1, acknowledged: 0 })
    f.gate.resolve()
    const complete = await f.service.wait(f.session.id, f.run.id, 'write-once')
    expect(complete?.physical).toMatchObject({ status: 'succeeded', executionStarted: true })
    expect(complete?.acknowledgedAt).not.toBeNull()
    expect(f.counts()).toEqual({ writes: 1, resources: 0, acknowledged: 1 })
    expect((await f.service.execute(f.request)).inputHash).toBe(logical.inputHash)
    expect(f.counts().writes).toBe(1)
    expect(
      await failure(
        f.service.execute({
          ...f.request,
          prepared: {
            ...f.request.prepared,
            invocation: { ...f.request.prepared.invocation, input: { sessionId: f.session.id, text: 'different' } },
          },
        }),
      ),
    ).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  } finally {
    await f.close()
  }
})

test('acknowledgment failure retries only retained acknowledgment and never repeats the command effect', async () => {
  const f = await fixture({ failAcknowledgments: 1 })
  try {
    f.gate.resolve()
    await f.service.execute(f.request)
    const pending = await f.service.wait(f.session.id, f.run.id, 'write-once')
    expect(pending?.physical?.status).toBe('succeeded')
    expect(pending?.acknowledgedAt).toBeNull()
    expect(f.counts()).toEqual({ writes: 1, resources: 1, acknowledged: 1 })
    expect((await f.service.reconcile(f.session.id, f.run.id, 'write-once'))?.acknowledgedAt).not.toBeNull()
    expect(f.counts()).toEqual({ writes: 1, resources: 0, acknowledged: 2 })
  } finally {
    await f.close()
  }
})

test('an invalid tracking receipt is re-read from its retained owner before acknowledgment without another command effect', async () => {
  const f = await fixture({ failAcknowledgments: 1, invalidAcknowledgment: true })
  try {
    f.gate.resolve()
    await f.service.execute(f.request)
    expect((await f.service.wait(f.session.id, f.run.id, 'write-once'))?.acknowledgedAt).toBeNull()
    expect(f.counts()).toEqual({ writes: 1, resources: 1, acknowledged: 1 })
    expect((await f.service.reconcile(f.session.id, f.run.id, 'write-once'))?.acknowledgedAt).not.toBeNull()
    expect(f.counts()).toEqual({ writes: 1, resources: 0, acknowledged: 2 })
  } finally {
    await f.close()
  }
})

test('large complete JSON uses verified artifact chunks and a damaged chunk is rejected without command replay', async () => {
  const text = '中文🎯'.repeat(1_100_000)
  const f = await fixture({ result: { text } })
  try {
    f.gate.resolve()
    await f.service.execute(f.request)
    const receipt = await f.service.wait(f.session.id, f.run.id, 'write-once')
    if (receipt?.logical?.kind !== 'artifacts') throw new Error('Expected a complete result manifest')
    expect(receipt.logical.chunks).toHaveLength(2)
    expect(await f.payloads.read(receipt.logical)).toEqual({ ok: true, result: { text } })
    expect(receipt.physical?.payload.kind).toBe('artifacts')
    expect(f.released).toHaveLength(4)
    expect(f.counts().resources).toBe(0)
    const chunk = receipt.logical.chunks[0]
    if (!chunk) throw new Error('Missing chunk')
    f.data.set(chunk.id, new Uint8Array(chunk.size))
    expect(await failure(f.payloads.read(receipt.logical))).toMatchObject({ code: 'COMMAND_RECEIPT_ARTIFACT' })
    expect(f.counts().writes).toBe(1)
  } finally {
    await f.close()
  }
})

test('workspace-scoped command results use the authenticated directory projection before either receipt is saved', async () => {
  const f = await fixture({ scoped: true })
  try {
    const prepared = await f.routing.prepare({
      protocol: 1,
      requestId: 'directory',
      commandId: 'workspace.list',
      commandVersion: 1,
      input: {},
    })
    await f.service.execute({ ...f.request, operationKey: 'directory', prepared })
    const receipt = await f.service.wait(f.session.id, f.run.id, 'directory')
    if (!receipt?.logical || !receipt.physical) throw new Error('Missing projected directory result')
    expect(await f.payloads.read(receipt.logical)).toEqual({
      ok: true,
      result: { items: [f.workspace], nextCursor: null },
    })
    expect(await f.payloads.read(receipt.physical.payload)).toEqual({
      status: 'succeeded',
      executionStarted: true,
      result: { items: [f.workspace], nextCursor: null },
    })
    expect(JSON.stringify(receipt)).not.toContain(f.forbidden.id)
    await f.storage.call('revokeDevice', f.device.id)
    expect(await failure(f.service.read(f.session.id, f.run.id, 'directory'))).toMatchObject({
      code: 'COMMAND_PRINCIPAL_REVOKED',
    })
  } finally {
    await f.close()
  }
})

test('saved directory results cannot expose old workspace access after the source device is narrowed', async () => {
  const f = await fixture()
  try {
    const prepared = await f.routing.prepare({
      protocol: 1,
      requestId: 'directory',
      commandId: 'workspace.list',
      commandVersion: 1,
      input: {},
    })
    await f.service.execute({ ...f.request, operationKey: 'directory', prepared })
    const original = await f.service.wait(f.session.id, f.run.id, 'directory')
    expect(JSON.stringify(original)).toContain(f.forbidden.id)
    await f.storage.call('revokeDevice', f.device.id)
    await f.storage.call('putDevice', { ...f.device, workspaceIds: [f.workspace.id] }, 'narrowed-token-hash')
    const narrowed = await f.service.read(f.session.id, f.run.id, 'directory')
    expect(narrowed?.logical).toMatchObject({ kind: 'unavailable', error: { code: 'COMMAND_RECEIPT_ACCESS_CHANGED' } })
    expect(narrowed?.physical?.payload).toMatchObject({ kind: 'unavailable' })
    expect(JSON.stringify(narrowed)).not.toContain(f.forbidden.id)
    const duplicate = await f.service.execute({ ...f.request, operationKey: 'directory', prepared })
    expect(JSON.stringify(duplicate)).not.toContain(f.forbidden.id)
  } finally {
    await f.close()
  }
})

test('explicit non-JSON payload loss saves actual success and releases its owner without replay', async () => {
  const f = await fixture({ result: { callback: () => {} } })
  try {
    f.gate.resolve()
    await f.service.execute(f.request)
    const receipt = await f.service.wait(f.session.id, f.run.id, 'write-once')
    expect(receipt?.physical).toMatchObject({
      status: 'succeeded',
      executionStarted: true,
      payload: { kind: 'unavailable' },
    })
    expect(receipt?.acknowledgedAt).not.toBeNull()
    expect(f.counts()).toEqual({ writes: 1, resources: 0, acknowledged: 1 })
  } finally {
    await f.close()
  }
})

test('a top-level undefined result preserves known physical success and saves explicit unavailable data', async () => {
  const f = await fixture({ result: undefined })
  try {
    f.gate.resolve()
    await f.service.execute(f.request)
    const receipt = await f.service.wait(f.session.id, f.run.id, 'write-once')
    expect(receipt?.physical).toMatchObject({
      status: 'succeeded',
      executionStarted: true,
      payload: { kind: 'unavailable' },
    })
    expect(receipt?.acknowledgedAt).not.toBeNull()
    expect(f.counts()).toEqual({ writes: 1, resources: 0, acknowledged: 1 })
  } finally {
    await f.close()
  }
})

test('a tracking timeout reconciles the same retained job and persists its late result without another command start', async () => {
  const f = await fixture({ timeoutMs: 15, maxTrackingMs: 500 })
  try {
    await f.service.execute(f.request)
    const uncertain = await f.service.wait(f.session.id, f.run.id, 'write-once')
    expect(uncertain?.physical).toBeNull()
    expect(uncertain?.uncertainty?.code).toBe('RESULT_UNKNOWN')
    expect(f.counts()).toEqual({ writes: 0, resources: 1, acknowledged: 0 })
    f.gate.resolve()
    const complete = await f.service.reconcile(f.session.id, f.run.id, 'write-once')
    expect(complete?.physical).toMatchObject({ status: 'succeeded', executionStarted: true })
    expect(complete?.uncertainty).toBeNull()
    expect(complete?.acknowledgedAt).not.toBeNull()
    expect(f.counts()).toEqual({ writes: 1, resources: 0, acknowledged: 1 })
  } finally {
    await f.close()
  }
})

test('an accepted receipt without local tracking is inspected and never re-executed by a replacement service', async () => {
  const f = await fixture({ timeoutMs: 15 })
  try {
    await f.service.execute(f.request)
    const replacement = f.createService()
    const receipt = await replacement.execute(f.request)
    expect(receipt.owner).not.toBeNull()
    expect(receipt.uncertainty?.code).toBe('RESULT_UNKNOWN')
    expect(f.counts()).toEqual({ writes: 0, resources: 1, acknowledged: 0 })
    f.gate.resolve()
    expect((await f.service.wait(f.session.id, f.run.id, 'write-once'))?.physical?.status).toBe('succeeded')
    expect(f.counts().writes).toBe(1)
  } finally {
    await f.close()
  }
})

test('failed result publication retains the original completed command and reconciliation retries only persistence', async () => {
  const f = await fixture({ result: { text: 'verified'.repeat(30_000) }, failPayloadWrites: 1 })
  try {
    f.gate.resolve()
    const response = await f.service.execute(f.request).catch((error: unknown) => error)
    if (response instanceof Error) expect(response).toMatchObject({ code: 'STORAGE_ERROR' })
    const pending = await f.service.wait(f.session.id, f.run.id, 'write-once')
    expect(pending?.logical === null || pending?.physical === null).toBe(true)
    expect(pending?.acknowledgedAt).toBeNull()
    expect(f.counts()).toEqual({ writes: 1, resources: 1, acknowledged: 0 })
    expect((await f.service.reconcile(f.session.id, f.run.id, 'write-once'))?.acknowledgedAt).not.toBeNull()
    expect(f.counts()).toEqual({ writes: 1, resources: 0, acknowledged: 1 })
  } finally {
    await f.close()
  }
})

test('source cancellation saves late physical settlement while refusing new command acceptance from the stopped Run', async () => {
  const f = await fixture()
  const controller = new AbortController()
  try {
    const response = f.service.execute({ ...f.request, signal: controller.signal })
    await f.entered.promise
    controller.abort()
    await f.storage.call('setRun', f.run.id, 'cancelled')
    const cancelled = await response
    expect(cancelled.physical).toBeNull()
    expect(f.counts()).toEqual({ writes: 0, resources: 1, acknowledged: 0 })
    f.gate.resolve()
    expect((await f.service.wait(f.session.id, f.run.id, 'write-once'))?.physical?.status).toBe('succeeded')
    expect(f.counts()).toEqual({ writes: 1, resources: 0, acknowledged: 1 })
    expect(await failure(f.service.execute({ ...f.request, operationKey: 'new-after-stop' }))).toMatchObject({
      code: 'COMMAND_SOURCE_INACTIVE',
    })
  } finally {
    await f.close()
  }
})
