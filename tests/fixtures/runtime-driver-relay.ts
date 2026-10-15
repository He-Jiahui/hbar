import { z } from 'zod'
import { HbarError, providerSchema } from '@hbar/contracts'
import type { RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import { IpcPeer, RuntimeCoordinator, procedure } from '@hbar/runtime'
import { runtimeDriverCallbackSchema, runtimeDriverStartSchema } from '@hbar/plugin-sdk/runtime-driver'
import { RuntimeDriverRelay, type RuntimeDriverRelayOptions } from '../../apps/host/src/runtime-driver-relay'

function paired(owner: RuntimeOwner, remote: RuntimeOwner) {
  let unit: IpcPeer | undefined
  const host = new IpcPeer({ owner, remote, transport: { send: (frame) => unit?.receive(frame) } })
  unit = new IpcPeer({ owner: remote, remote: owner, transport: { send: (frame) => host.receive(frame) } })
  return { host, unit }
}

/** Real framed IPC and execution coordination; only persistence and driver execution are local fixtures. */
export function driverRelayFixture(
  options: {
    readonly createRelay?: (options: RuntimeDriverRelayOptions) => RuntimeDriverRelay
    readonly startError?: HbarError
  } = {},
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
      storageSchema: 24,
    })
    coordinator.activate(value)
  }
  const kernelPeers = paired(base, kernel),
    driverPeers = paired(base, driver)
  const relayOptions: RuntimeDriverRelayOptions = {
    coordinator,
    resolve: () => ({ owner: driver, version: version(driver), peer: driverPeers.host }),
  }
  const relay = options.createRelay ? options.createRelay(relayOptions) : new RuntimeDriverRelay(relayOptions)
  const detach = [relay.attachKernel(kernelPeers.host), relay.attachDriver(driverPeers.host)]
  let starts = 0,
    callbacks = 0,
    terminals = 0
  driverPeers.unit.register(
    'driver.start',
    procedure(runtimeDriverStartSchema, z.strictObject({ invocationId: z.string() }), (input) => {
      starts++
      if (options.startError) throw options.startError
      return { invocationId: input.invocationId }
    }),
  )
  kernelPeers.unit.register(
    'driver.callback',
    procedure(runtimeDriverCallbackSchema, z.unknown(), () => {
      callbacks++
      return null
    }),
  )
  kernelPeers.unit.onEvent('driver.terminal', z.unknown(), () => {
    terminals++
  })
  const model = providerSchema.parse({
    id: 'fixture',
    name: 'Fixture',
    protocol: 'mock',
    model: 'fixture',
    baseUrl: 'http://127.0.0.1',
  })
  async function payload(invocationId: string, system = 'fixture') {
    const sessionId = `session-${invocationId}`,
      runId = `run-${invocationId}`
    const ownership = await coordinator.claim(kernel, sessionId, runId, {
      kernel: version(kernel),
      driver: version(driver),
      plugins: [],
      hooks: [],
    })
    if (!ownership) throw new Error('Driver fixture lease was not admitted')
    return runtimeDriverStartSchema.parse({
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
        requestId: `request-${invocationId}`,
        input: { text: 'fixture', images: [] },
        modelId: model.id,
        status: 'running',
        createdAt: 1,
        startedAt: 1,
        endedAt: null,
        error: null,
      },
      request: { system, model, messages: [] },
    })
  }
  return {
    relay,
    payload,
    coordinator,
    driver,
    kernel,
    start: (input: z.output<typeof runtimeDriverStartSchema>) =>
      kernelPeers.unit.call('driver.start', input, z.strictObject({ invocationId: z.string() })),
    callback: (invocationId: string) =>
      driverPeers.unit.call('driver.callback', { invocationId, method: 'resolveKey', modelId: 'fixture' }, z.null()),
    terminal: (invocationId: string) =>
      driverPeers.unit.notify('driver.terminal', { invocationId, ok: true, reasonCode: null }),
    stats: () => ({ starts, callbacks, terminals, ...relay.snapshot() }),
    close() {
      relay.driverExited(driver)
      for (const dispose of detach) dispose()
      kernelPeers.host.close()
      kernelPeers.unit.close()
      driverPeers.host.close()
      driverPeers.unit.close()
    },
  }
}
