import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { providerSchema } from '@hbar/contracts'
import type { ModelRequest } from '@hbar/plugin-sdk'
import {
  runtimeDriverSummarySchema,
  runtimeDriverStartSchema,
  runtimeMessageSchema,
  runtimeModelRequestSchema,
} from '@hbar/plugin-sdk/runtime-driver'
import { IpcPeer, ManagedProcess, RuntimeArtifactStore, RuntimeCoordinator } from '@hbar/runtime'
import type { RuntimeOwner, RuntimeUnitDescriptor, RuntimeVersion } from '@hbar/contracts/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { nextSummaryChunk } from '../packages/kernel/src/context-compaction'
import { RuntimeDriverAdapter } from '../apps/host/src/runtime-driver-adapter'
import { RuntimeDriverRelay, type RuntimeDriverEndpoint } from '../apps/host/src/runtime-driver-relay'
import { DRIVER_RUNTIME_FINGERPRINT } from '../apps/host/src/runtime-driver-contract'

function request(runId?: string): ModelRequest {
  return {
    system: 'Summarize fixture history',
    model: providerSchema.parse({
      id: 'fixture',
      name: 'Fixture',
      protocol: 'mock',
      model: 'fixture',
      baseUrl: 'http://127.0.0.1',
    }),
    messages: [
      {
        id: 'context-summary-1',
        sessionId: 'session',
        runId: '',
        role: 'user',
        seq: 1,
        createdAt: 0,
        content: [{ type: 'text', text: 'Historical synthetic summary' }],
      },
    ],
    context: {
      sessionId: 'session',
      ...(runId ? { runId, purpose: 'execution' as const } : { purpose: 'context-inspection' as const }),
    },
  }
}

test('summary identity distinguishes current execution from unowned inspection without weakening ordinary messages', () => {
  const withHistoricalSession = request('current-run')
  if (!withHistoricalSession.context) throw new Error('Expected current request context')
  withHistoricalSession.context.sessionId = 'current-session'
  const current = nextSummaryChunk(withHistoricalSession, 'Fixture history', 0, '').request
  expect(current.messages[0]?.sessionId).toBe('current-session')
  expect(current.context?.sessionId).toBe('current-session')
  expect(current.messages[0]?.runId).toBe('current-run')
  expect(runtimeDriverSummarySchema.safeParse({ request: current, apiKey: null }).success).toBe(true)
  expect(runtimeModelRequestSchema.safeParse(current).success).toBe(true)
  const inspection = nextSummaryChunk(request(), 'Fixture history', 0, '').request
  expect(inspection.messages[0]?.runId).toBe('')
  expect(Object.hasOwn(inspection.context ?? {}, 'runId')).toBe(false)
  expect(
    runtimeDriverSummarySchema.safeParse({
      request: { ...inspection, context: { ...inspection.context, runId: '' } },
      apiKey: null,
    }).success,
  ).toBe(false)
  expect(runtimeDriverSummarySchema.safeParse({ request: inspection, apiKey: null }).success).toBe(true)
  expect(runtimeMessageSchema.safeParse(inspection.messages[0]).success).toBe(false)
  expect(runtimeModelRequestSchema.safeParse(inspection).success).toBe(false)
  expect(runtimeDriverStartSchema.shape.request.safeParse(inspection).success).toBe(false)
  for (const changed of [
    { ...inspection, context: { sessionId: 'session', purpose: 'execution' } },
    { ...inspection, messages: inspection.messages.map((message) => ({ ...message, providerData: {} })) },
    { ...inspection, messages: inspection.messages.map((message) => ({ ...message, role: 'assistant' })) },
  ])
    expect(runtimeDriverSummarySchema.safeParse({ request: changed, apiKey: null }).success).toBe(false)
})

// This fixture validates summary wire/driver behavior; it does not claim a durable execution lease.
test('real managed Pi summary accepts generated execution and manual inspection chunks through adapter and relay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-summary-identity-'))
  const descriptor: RuntimeUnitDescriptor = {
    id: 'driver.pi',
    kind: 'driver',
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: DRIVER_RUNTIME_FINGERPRINT,
    storageSchema: STORAGE_SCHEMA_VERSION,
  }
  const base: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: crypto.randomUUID() }
  const kernel: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: crypto.randomUUID() }
  const coordinator = new RuntimeCoordinator({
    claim: async (lease) => lease,
    release: async () => {},
    revoke: async () => {},
  })
  const version: RuntimeVersion = { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) }
  coordinator.register(kernel, version, { ...descriptor, id: 'kernel', kind: 'kernel' })
  coordinator.activate(kernel)
  let endpoint: RuntimeDriverEndpoint | undefined
  const relay = new RuntimeDriverRelay({
    coordinator,
    resolve: () => {
      if (!endpoint) throw new Error('Driver endpoint not ready')
      return endpoint
    },
  })
  let host: IpcPeer | undefined
  const caller = new IpcPeer({
    owner: kernel,
    remote: base,
    transport: {
      send: (frame) => {
        if (!host) throw new Error('Host peer not ready')
        host.receive(frame)
      },
    },
  })
  host = new IpcPeer({ owner: base, remote: kernel, transport: { send: (frame) => caller.receive(frame) } })
  const detach = relay.attachKernel(host)
  const adapter = new RuntimeDriverAdapter(caller)
  let driver: ManagedProcess | undefined
  try {
    const artifacts = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
    const artifact = await artifacts.build({ descriptor, entrypoint: 'apps/host/src/runtime-driver-process.ts' })
    driver = new ManagedProcess({
      descriptor,
      artifactId: artifact.id,
      modulePath: await artifacts.modulePath(artifact.id),
      generation: 1,
      parent: base,
      onPeer: (peer, owner) => {
        const driverVersion: RuntimeVersion = {
          unitId: owner.unitId,
          generation: owner.generation,
          artifactId: artifact.id,
        }
        coordinator.register(owner, driverVersion, descriptor)
        endpoint = { peer, owner, version: driverVersion }
        relay.attachDriver(peer)
      },
      onExit: async (owner) => {
        coordinator.ownerExited(owner)
        relay.driverExited(owner)
      },
    })
    await driver.prepare()
    coordinator.activate(driver.owner())
    await driver.activate()
    for (const input of [request('current-run'), request()]) {
      const chunk = nextSummaryChunk(input, 'Fixture history', 0, '').request
      const summary = await adapter.summarize(chunk, null, new AbortController().signal)
      expect(summary.text).toContain('Summary: preserve')
      expect(summary.usage.output).toBeGreaterThan(0)
    }
    const invalid = nextSummaryChunk(request(), 'Fixture history', 0, '').request
    const firstMessage = invalid.messages[0]
    if (!firstMessage) throw new Error('Expected synthetic message')
    invalid.messages[0] = { ...firstMessage, role: 'assistant' }
    let invalidError: unknown
    try {
      await adapter.summarize(invalid, null, new AbortController().signal)
    } catch (error: unknown) {
      invalidError = error
    }
    expect(invalidError).toBeDefined()
    const controller = new AbortController()
    controller.abort()
    let rejected: unknown
    try {
      await adapter.summarize(nextSummaryChunk(request(), 'Fixture history', 0, '').request, null, controller.signal)
    } catch (error: unknown) {
      rejected = error
    }
    expect(rejected).toBeDefined()
  } finally {
    adapter.dispose()
    detach()
    caller.close()
    host?.close()
    await driver?.dispose()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
