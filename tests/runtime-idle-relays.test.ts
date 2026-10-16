import { expect, test } from 'bun:test'
import { z } from 'zod'
import { IpcPeer, procedure, RuntimeCoordinator, RuntimeValuePort } from '@hbar/runtime'
import { StableStoragePort, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { runtimePluginStateSchema } from '@hbar/plugin-sdk/runtime-plugin'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import type { HostRuntimeDemandPort } from '../apps/host/src/runtime-host-demand'
import { RuntimePluginRelay } from '../apps/host/src/runtime-plugin-relay'
import { RuntimePluginCatalogCache } from '../apps/host/src/runtime-plugin-catalog-cache'
import { RuntimeNodeLinkRelay } from '../apps/host/src/runtime-node-link-relay'
import {
  runtimeNodeOpenSchema,
  runtimeNodeFrameSchema,
  runtimeNodeCloseSchema,
} from '../apps/host/src/runtime-node-link-contract'

function gate() {
  let release: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    promise,
    release() {
      if (!release) throw new Error('Missing gate')
      release()
    },
  }
}
async function pump() {
  for (let i = 0; i < 64; i++) await Promise.resolve()
}
function pair(remote: RuntimeOwner) {
  const owner = { unitId: 'host', generation: 1, incarnation: 'host-relay' }
  let receiver: IpcPeer | undefined
  const host = new IpcPeer({ owner, remote, transport: { send: (frame) => receiver?.receive(frame) } })
  const child = new IpcPeer({ owner: remote, remote: owner, transport: { send: (frame) => host.receive(frame) } })
  receiver = child
  return {
    host,
    child,
    close() {
      host.close()
      child.close()
    },
  }
}
function demands(owner: RuntimeOwner) {
  let held = 0,
    acquired = 0,
    released = 0
  const port: HostRuntimeDemandPort = {
    acquire: () => {
      held++
      acquired++
      let done = false
      return Promise.resolve({
        owners: [owner],
        release() {
          if (done) return
          done = true
          held--
          released++
        },
      })
    },
  }
  return {
    port,
    get held() {
      return held
    },
    get acquired() {
      return acquired
    },
    get released() {
      return released
    },
  }
}
const state = runtimePluginStateSchema.parse({
  manifests: [
    {
      id: 'fixture',
      name: 'Fixture',
      version: '1',
      apiVersion: '1',
      description: 'Fixture',
      scope: 'host',
      permissions: [],
    },
  ],
  config: { revision: 7 },
  configSchema: { type: 'object' },
  tools: [],
  hooks: ['run.start'],
  panels: [],
  capabilities: { budget: ['get'] },
})

/** Deferred typed demand fixture only; releases are counted raw, NOT made idempotent by the fixture. */
function deferredDemands(owner: RuntimeOwner) {
  const pending: Array<() => void> = []
  let held = 0,
    acquired = 0,
    released = 0
  const port: HostRuntimeDemandPort = {
    acquire: () => {
      acquired++
      held++
      return new Promise((resolve) => {
        pending.push(() =>
          resolve({
            owners: [owner],
            release() {
              held--
              released++
            },
          }),
        )
      })
    },
  }
  return {
    port,
    get held() {
      return held
    },
    get acquired() {
      return acquired
    },
    get released() {
      return released
    },
    grant(index: number) {
      const grant = pending[index]
      if (!grant) throw new Error('Missing demand waiter')
      grant()
    },
  }
}

test('node default changing across awaited demand rejects before open and releases exactly once', async () => {
  const old = { unitId: 'node-link', generation: 1, incarnation: 'old-demand' },
    next = { unitId: 'node-link', generation: 2, incarnation: 'new-demand' },
    peers = pair(next),
    demand = deferredDemands(old)
  let opens = 0
  peers.child.register(
    'nodeLink.open',
    procedure(runtimeNodeOpenSchema, z.undefined(), () => {
      opens++
    }),
  )
  const unavailable = () => Promise.reject(new Error('Unexpected observation'))
  const relay = new RuntimeNodeLinkRelay({
    demand: demand.port,
    current: () => ({ owner: next, peer: peers.host }),
    authorized: () => true,
    state: {
      call() {
        throw new Error('Unexpected registry')
      },
    },
    observations: {
      node: unavailable,
      list: unavailable,
      session: unavailable,
      workspace: unavailable,
      snapshot: unavailable,
      events: unavailable,
    },
  })
  const outcome = relay.open('changed', 'fixture', { send: () => true, close: () => {} }).then(
    () => null,
    (error: unknown) => error,
  )
  try {
    expect(demand.acquired).toBe(1)
    demand.grant(0)
    expect(await outcome).toMatchObject({ code: 'RUNTIME_DEMAND_OWNER_CHANGED' })
    expect(opens).toBe(0)
    expect(demand.held).toBe(0)
    expect(demand.released).toBe(1)
    relay.exited(old)
    relay.exited(next)
    expect(demand.released).toBe(1)
  } finally {
    demand.grant(0)
    relay.exited(old)
    relay.exited(next)
    peers.close()
  }
})

test('two opens with the same connection identity competing across wake keep only one resource hold', async () => {
  const owner = { unitId: 'node-link', generation: 1, incarnation: 'racing-open' },
    peers = pair(owner),
    demand = deferredDemands(owner)
  let opens = 0,
    closes = 0
  peers.child.register(
    'nodeLink.open',
    procedure(runtimeNodeOpenSchema, z.undefined(), () => {
      opens++
    }),
  )
  peers.child.register(
    'nodeLink.close',
    procedure(runtimeNodeCloseSchema, z.undefined(), () => {
      closes++
    }),
  )
  const unavailable = () => Promise.reject(new Error('Unexpected observation'))
  const relay = new RuntimeNodeLinkRelay({
    demand: demand.port,
    current: () => ({ owner, peer: peers.host }),
    authorized: () => true,
    state: {
      call() {
        throw new Error('Unexpected registry')
      },
    },
    observations: {
      node: unavailable,
      list: unavailable,
      session: unavailable,
      workspace: unavailable,
      snapshot: unavailable,
      events: unavailable,
    },
  })
  const transport = { send: () => true, close: () => {} }
  const first = relay.open('same', 'fixture', transport).then(
    () => null,
    (error: unknown) => error,
  )
  const second = relay.open('same', 'fixture', transport).then(
    () => null,
    (error: unknown) => error,
  )
  try {
    expect(demand.acquired).toBe(2)
    // Grant the second waiter first; identity recheck must reject the other after its wake.
    demand.grant(1)
    await pump()
    demand.grant(0)
    expect(await first).toMatchObject({ code: 'NODE_BUSY' })
    expect(await second).toBeNull()
    expect(opens).toBe(1)
    expect(demand.held).toBe(1)
    expect(demand.released).toBe(1)
    relay.closeConnection('same')
    await pump()
    expect(closes).toBe(1)
    expect(demand.held).toBe(0)
    expect(demand.released).toBe(2)
    relay.exited(owner)
    relay.exited(owner)
    expect(demand.released).toBe(2)
  } finally {
    demand.grant(0)
    demand.grant(1)
    relay.closeConnection('same')
    relay.exited(owner)
    peers.close()
  }
})
function coordinator(kernel: RuntimeOwner, plugin: RuntimeOwner) {
  const value = new RuntimeCoordinator({
    claim: (lease) => Promise.resolve(lease),
    release: () => Promise.resolve(),
    revoke: () => Promise.resolve(),
  })
  for (const owner of [kernel, plugin]) {
    value.register(
      owner,
      { unitId: owner.unitId, generation: owner.generation, artifactId: 'a'.repeat(64) },
      {
        id: owner.unitId,
        kind: owner.unitId === 'kernel' ? 'kernel' : 'plugin',
        isolation: 'process',
        required: true,
        reloadable: true,
        dependencies: [],
        contractFingerprint: 'a'.repeat(64),
        storageSchema: STORAGE_SCHEMA_VERSION,
      },
    )
    value.activate(owner, 'default')
  }
  return value
}

test('cached plugin catalog retains complete metadata without waking a sleeping process', async () => {
  const owner = { unitId: 'plugin.fixture', generation: 1, incarnation: 'plugin-a' }
  const kernel = { unitId: 'kernel', generation: 1, incarnation: 'kernel-a' }
  const cache = new RuntimePluginCatalogCache([owner.unitId])
  cache.publish(owner, { unitId: owner.unitId, generation: 1, artifactId: 'a'.repeat(64) }, state)
  const demand = demands(owner),
    peers = pair(kernel)
  const relay = new RuntimePluginRelay({
    storage: new StableStoragePort(),
    coordinator: coordinator(kernel, owner),
    demand: demand.port,
    catalog: () => cache.snapshot(),
    retainedVersion: () => undefined,
    resolve: () => {
      throw new Error('Sleeping endpoint must not be resolved')
    },
  })
  const detach = relay.attachKernel(peers.host, kernel)
  const application = new RuntimeValuePort(peers.child, { prefix: 'kernel.plugins' })
  try {
    const result = await application.call('catalog', [])
    expect(result).toEqual([{ unitId: owner.unitId, state }])
    expect(demand.acquired).toBe(0)
    expect(cache.metadata()).toEqual([
      { owner, version: { unitId: owner.unitId, generation: 1, artifactId: 'a'.repeat(64) } },
    ])
    const copy = cache.snapshot()
    const first = copy[0]
    if (!first) throw new Error('Missing cache row')
    first.state.config.revision = 900
    expect(cache.snapshot()[0]?.state.config.revision).toBe(7)
  } finally {
    application.dispose()
    detach()
    peers.close()
  }
})

test('unbound plugin abort retains demand until actual invocation reply; attachment disposal is not join', async () => {
  const owner = { unitId: 'plugin.fixture', generation: 1, incarnation: 'plugin-b' }
  const kernel = { unitId: 'kernel', generation: 1, incarnation: 'kernel-b' }
  const pluginPeers = pair(owner),
    kernelPeers = pair(kernel),
    blocked = gate(),
    entered = gate(),
    abort = new AbortController()
  const demand = demands(owner)
  const endpointApplication = new RuntimeValuePort(pluginPeers.host, { prefix: 'plugin.application' })
  const childApplication = new RuntimeValuePort(pluginPeers.child, { prefix: 'plugin.application' })
  childApplication.register('invoke', async () => {
    entered.release()
    await blocked.promise
    return { kind: 'value', value: 1 }
  })
  const relay = new RuntimePluginRelay({
    storage: new StableStoragePort(),
    coordinator: coordinator(kernel, owner),
    demand: demand.port,
    catalog: () => [{ unitId: owner.unitId, state }],
    retainedVersion: () => undefined,
    resolve: () => ({
      owner,
      state,
      application: endpointApplication,
      version: { unitId: owner.unitId, generation: 1, artifactId: 'a'.repeat(64) },
    }),
  })
  const detach = relay.attachKernel(kernelPeers.host, kernel)
  const kernelApplication = new RuntimeValuePort(kernelPeers.child, { prefix: 'kernel.plugins' })
  const call = kernelApplication.call(
    'invoke',
    [
      owner.unitId,
      { sessionId: 'idle-session' },
      { operation: 'capability', name: 'budget', method: 'get', catalog: [] },
      [],
      () => null,
    ],
    { signal: abort.signal },
  )
  const outcome = call.catch((error: unknown) => error)
  try {
    await entered.promise
    expect(demand.held).toBe(1)
    abort.abort()
    await outcome
    await pump()
    expect(demand.held).toBe(1)
    detach()
    expect(demand.held).toBe(1)
    blocked.release()
    await pump()
    expect(demand.held).toBe(0)
    expect(demand.released).toBe(1)
  } finally {
    blocked.release()
    relay.exited(owner)
    kernelApplication.dispose()
    childApplication.dispose()
    endpointApplication.dispose()
    detach()
    kernelPeers.close()
    pluginPeers.close()
  }
})

function nodeFixture() {
  const owner = { unitId: 'node-link', generation: 1, incarnation: 'node-a' },
    peers = pair(owner),
    demand = demands(owner)
  let currentAvailable = true
  const unavailable = () => Promise.reject(new Error('Unexpected fixture observation'))
  const relay = new RuntimeNodeLinkRelay({
    demand: demand.port,
    current: () => {
      if (!currentAvailable) throw new Error('Bound socket must not resolve current default')
      return { owner, peer: peers.host }
    },
    authorized: () => true,
    state: {
      call() {
        throw new Error('Unexpected registry request')
      },
    },
    observations: {
      node: unavailable,
      list: unavailable,
      session: unavailable,
      workspace: unavailable,
      snapshot: unavailable,
      events: unavailable,
    },
  })
  peers.child.register(
    'nodeLink.open',
    procedure(runtimeNodeOpenSchema, z.undefined(), () => undefined),
  )
  peers.child.register(
    'nodeLink.close',
    procedure(runtimeNodeCloseSchema, z.undefined(), () => undefined),
  )
  return {
    owner,
    peers,
    demand,
    relay,
    hideCurrent() {
      currentAvailable = false
    },
  }
}

test('socket pins closure and routes frame to captured owner; logical fault waits for native join', async () => {
  const h = nodeFixture(),
    blocked = gate(),
    entered = gate()
  h.peers.child.register(
    'nodeLink.frame',
    procedure(runtimeNodeFrameSchema, z.undefined(), async () => {
      entered.release()
      await blocked.promise
    }),
  )
  try {
    await h.relay.open('connection', 'fixture', { send: () => true, close: () => {} })
    expect(h.demand.held).toBe(1)
    h.hideCurrent()
    const frame = h.relay.receive('connection', 'frame')
    const outcome = frame.catch((error: unknown) => error)
    await entered.promise
    expect(h.demand.acquired).toBe(1)
    h.relay.faulted(h.owner)
    expect(h.demand.held).toBe(1)
    h.peers.host.close()
    await outcome
    expect(h.demand.held).toBe(1)
    h.relay.exited({ ...h.owner, incarnation: 'another' })
    expect(h.demand.held).toBe(1)
    h.relay.exited(h.owner)
    expect(h.demand.held).toBe(0)
    expect(h.demand.released).toBe(1)
  } finally {
    blocked.release()
    h.relay.exited(h.owner)
    h.peers.close()
  }
})

test('closed socket waits for outstanding physical frame even after close reply', async () => {
  const h = nodeFixture(),
    blocked = gate(),
    entered = gate()
  h.peers.child.register(
    'nodeLink.frame',
    procedure(runtimeNodeFrameSchema, z.undefined(), async () => {
      entered.release()
      await blocked.promise
    }),
  )
  try {
    await h.relay.open('connection', 'fixture', { send: () => true, close: () => {} })
    const frame = h.relay.receive('connection', 'frame')
    await entered.promise
    h.relay.closeConnection('connection')
    await pump()
    expect(h.demand.held).toBe(1)
    blocked.release()
    await frame
    await pump()
    expect(h.demand.held).toBe(0)
    expect(h.demand.released).toBe(1)
  } finally {
    blocked.release()
    h.relay.exited(h.owner)
    h.peers.close()
  }
})
test('retained session plugin invocation never wakes or substitutes the default owner', async () => {
  const owner = { unitId: 'plugin.fixture', generation: 1, incarnation: 'retained-plugin' }
  const kernel = { unitId: 'kernel', generation: 1, incarnation: 'retained-kernel' }
  const version = { unitId: owner.unitId, generation: 1, artifactId: 'a'.repeat(64) }
  const pluginPeers = pair(owner),
    kernelPeers = pair(kernel),
    demand = demands(owner)
  const endpoint = new RuntimeValuePort(pluginPeers.host, { prefix: 'plugin.application' })
  const child = new RuntimeValuePort(pluginPeers.child, { prefix: 'plugin.application' })
  child.register('invoke', () => ({ kind: 'value', value: 'old-owner' }))
  const relay = new RuntimePluginRelay({
    storage: new StableStoragePort(),
    coordinator: coordinator(kernel, owner),
    demand: demand.port,
    catalog: () => [{ unitId: owner.unitId, state }],
    retainedVersion: (_unitId, sessionId) => (sessionId === 'retained' ? version : undefined),
    resolve: (_unitId, _execution, sessionId) => {
      expect(sessionId).toBe('retained')
      return { owner, version, state, application: endpoint }
    },
  })
  const detach = relay.attachKernel(kernelPeers.host, kernel)
  const caller = new RuntimeValuePort(kernelPeers.child, { prefix: 'kernel.plugins' })
  try {
    expect(
      await caller.call<unknown>('invoke', [
        owner.unitId,
        { sessionId: 'retained' },
        { operation: 'capability', name: 'budget', method: 'get', catalog: [] },
        [],
        () => null,
      ]),
    ).toEqual({ kind: 'value', value: 'old-owner' })
    expect(demand.acquired).toBe(0)
  } finally {
    relay.exited(owner)
    detach()
    caller.dispose()
    child.dispose()
    endpoint.dispose()
    kernelPeers.close()
    pluginPeers.close()
  }
})
