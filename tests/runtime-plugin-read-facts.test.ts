import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { sessionReadFactsInputSchema, sessionReadFactsSchema } from '@hbar/contracts'
import type { SessionReadFacts, SessionReadFactsInput, ToolWindowContribution } from '@hbar/contracts'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Context } from '@hbar/plugin-sdk'
import type { ToolDefinition } from '@hbar/plugin-sdk'
import { runtimePluginStateSchema } from '@hbar/plugin-sdk/runtime-plugin'
import { IpcPeer, RuntimeCoordinator, RuntimeValuePort } from '@hbar/runtime'
import { StableStoragePort, Storage, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import type { StorageMethods } from '@hbar/storage'
import { RuntimePluginAdapter } from '../apps/host/src/runtime-plugin-adapter'
import { createRuntimePluginAPI, RuntimePluginHooks } from '../apps/host/src/runtime-plugin-api'
import { runtimePluginInvocationSchema } from '../apps/host/src/runtime-plugin-contract'
import { RuntimePluginRelay } from '../apps/host/src/runtime-plugin-relay'
import { removeOwnedTestDirectory } from './owned-temp-directory'

function pair(owner: RuntimeOwner, remote: RuntimeOwner) {
  const frames: string[] = []
  let right: IpcPeer | undefined
  const left = new IpcPeer({
    owner,
    remote,
    transport: {
      send(frame) {
        frames.push(JSON.stringify(frame))
        right?.receive(frame)
      },
    },
  })
  right = new IpcPeer({
    owner: remote,
    remote: owner,
    transport: {
      send(frame) {
        frames.push(JSON.stringify(frame))
        left.receive(frame)
      },
    },
  })
  return {
    left,
    right,
    frames,
    close() {
      left.close()
      right?.close()
    },
  }
}

test('the plugin API and authenticated relay carry bounded facts through the existing public Storage port', async () => {
  const prefix = 'hbar-plugin-facts-read-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const base: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: 'facts-base' }
  const plugin: RuntimeOwner = { unitId: 'plugin.facts', generation: 1, incarnation: 'facts-plugin' }
  const wire = pair(base, plugin)
  const values = new RuntimeValuePort(wire.right, { prefix: 'plugin.application' })
  const stable = new StableStoragePort()
  const coordinator = new RuntimeCoordinator({
    claim: async (value) => value,
    release: async () => {},
    revoke: async () => {},
  })
  coordinator.register(
    plugin,
    { unitId: plugin.unitId, generation: 1, artifactId: 'a'.repeat(64) },
    {
      id: plugin.unitId,
      kind: 'plugin',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: STORAGE_SCHEMA_VERSION,
    },
  )
  coordinator.activate(plugin)
  const relay = new RuntimePluginRelay({
    storage: stable,
    coordinator,
    current: () => [],
    resolve: () => {
      throw new Error('No capability invocation is expected')
    },
  })
  const attached = relay.attachPlugin(wire.left, plugin)
  const ctx = new Context()
  let storage: Storage | undefined
  let retired = false
  try {
    const actual = new Storage(join(root, 'fixture.sqlite'))
    storage = actual
    await actual.call('ready')
    let reads = 0
    stable.install({
      owner: { unitId: 'storage', generation: 1, incarnation: 'facts-storage' },
      call<Method extends keyof StorageMethods>(method: Method, args: Parameters<StorageMethods[Method]>) {
        if (method !== 'readSessionFacts') throw new Error('The fixture writer only serves the bounded read')
        reads++
        return actual.call(method, ...args)
      },
      retire: async () => {
        await actual.close()
        retired = true
      },
    })
    const workspace = await actual.call('createWorkspace', root, 'Managed facts fixture')
    const session = await actual.call('createSession', workspace.id)
    await actual.call(
      'enqueue',
      session.id,
      'managed-facts-request',
      {
        text: 'private-admitted-text-'.repeat(8_192),
        images: [],
      },
      'local-fixture',
    )
    await actual.call('append', session.id, 'fixture.noise', { body: 'unrelated-journal-body-'.repeat(8_192) })
    const api = createRuntimePluginAPI({
      ctx,
      hooks: new RuntimePluginHooks(),
      entries: new Map<string, ToolDefinition>(),
      panels: new Map<string, ToolWindowContribution>(),
      ownerId: plugin.unitId,
      preparing: () => false,
      fallback: (method, args) => values.call('host.read', [method, args]),
      resources: {
        retain: async () => {
          throw new Error('Read facts cannot acquire native resources')
        },
      },
    })
    if (!api.sessions.readFacts) throw new Error('Missing managed readFacts API')
    const input = { sessionId: session.id, eventLimit: 100, includeRuns: false }
    const direct = stable.call('readSessionFacts', input)
    expect(stable.writeCallsInFlight).toBe(0)
    const expected = await actual.call('readSessionFacts', input)
    expect(await direct).toEqual(expected)
    const pending = api.sessions.readFacts(input)
    expect(sessionReadFactsSchema.parse(await pending)).toEqual(expected)
    expect(reads).toBe(2)
    expect(wire.frames.join('\n')).not.toContain('private-admitted-text-')
    expect(wire.frames.join('\n')).not.toContain('unrelated-journal-body-')
    let invalid: unknown
    try {
      await api.sessions.readFacts({ sessionId: session.id, eventLimit: 0 })
    } catch (error) {
      invalid = error
    }
    expect(invalid).toBeDefined()
    expect(reads).toBe(2)

    // The relay must reject an unregistered generation before dispatching any Storage read.
    const stale = { ...plugin, generation: 2, incarnation: 'facts-plugin-stale' }
    const staleWire = pair(base, stale)
    const staleAttached = relay.attachPlugin(staleWire.left, stale)
    const staleValues = new RuntimeValuePort(staleWire.right, { prefix: 'plugin.application' })
    try {
      let denied: unknown
      try {
        await staleValues.call('host.read', ['sessions.readFacts', [input]])
      } catch (error) {
        denied = error
      }
      expect(denied).toMatchObject({ code: 'RUNTIME_OWNER_UNKNOWN' })
      expect(reads).toBe(2)
    } finally {
      staleValues.dispose()
      staleAttached.dispose()
      staleWire.close()
    }
  } finally {
    values.dispose()
    attached.dispose()
    wire.close()
    try {
      await stable.close()
    } finally {
      try {
        if (!retired) await storage?.close()
      } finally {
        try {
          await ctx.fiber.dispose()
        } finally {
          await removeOwnedTestDirectory(root, prefix)
        }
      }
    }
  }
})

interface FactsProbe {
  read(input: SessionReadFactsInput): Promise<SessionReadFacts>
}
function isHostCallback(value: unknown): value is (method: string, args: readonly unknown[]) => unknown {
  return typeof value === 'function'
}

test('the managed Kernel adapter admits only the declared readFacts callback', async () => {
  const prefix = 'hbar-plugin-facts-adapter-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const host: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: 'facts-adapter-base' }
  const owner: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'facts-adapter-kernel' }
  const wire = pair(owner, host)
  const hostValues = new RuntimeValuePort(wire.right, { prefix: 'kernel.plugins' })
  const state = runtimePluginStateSchema.parse({
    manifests: [
      {
        id: 'fixture.facts-adapter',
        name: 'Facts adapter',
        description: 'Read a declared Session fact',
        version: '1.0.0',
        apiVersion: '^1.0.0',
        scope: 'host',
        permissions: [],
        provides: { factsProbe: '1.0.0' },
      },
    ],
    config: {},
    configSchema: null,
    tools: [],
    hooks: [],
    panels: [],
    capabilities: { factsProbe: ['read'] },
  })
  hostValues.register('catalog', () => [{ unitId: 'plugin.facts-adapter', state }])
  let callbackMethod = 'sessions.readFacts'
  const callbacks: string[] = []
  hostValues.register('invoke', async (args) => {
    const request = runtimePluginInvocationSchema.parse(args[2])
    if (request.operation !== 'capability' || request.name !== 'factsProbe' || request.method !== 'read')
      throw new Error('Unexpected managed capability')
    const parameters = z.tuple([sessionReadFactsInputSchema]).parse(args[3])
    const callback = args[4]
    if (!isHostCallback(callback)) throw new Error('Missing declared Host callback')
    callbacks.push(callbackMethod)
    return { kind: 'value', value: await callback(callbackMethod, parameters) }
  })
  let kernel: Kernel | undefined
  const adapter = new RuntimePluginAdapter(wire.left, () => {
    if (!kernel) throw new Error('Kernel is not ready')
    return kernel
  })
  try {
    const managedPlugins = await adapter.load()
    kernel = await Kernel.create({
      dataRoot: join(root, 'data'),
      cacheRoot: join(root, 'cache'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profile: { managedPlugins },
    })
    kernel.beginDrain()
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing adapter fixture workspace')
    const session = await kernel.createSession(workspace.id)
    const probe = kernel.plugins.get<FactsProbe>('factsProbe')
    const input = { sessionId: session.id, includeRuns: false, eventLimit: 100 }
    expect(sessionReadFactsSchema.parse(await probe.read(input))).toEqual(
      await kernel.storage.call('readSessionFacts', input),
    )
    expect(callbacks).toEqual(['sessions.readFacts'])
    callbackMethod = 'sessions.readFactsExtra'
    let denied: unknown
    try {
      await probe.read(input)
    } catch (error) {
      denied = error
    }
    expect(denied).toMatchObject({ code: 'RUNTIME_METHOD_UNAVAILABLE' })
    expect((await kernel.storage.call('readSessionFacts', input)).sessionId).toBe(session.id)
  } finally {
    adapter.dispose()
    hostValues.dispose()
    wire.close()
    try {
      await kernel?.close()
    } finally {
      await removeOwnedTestDirectory(root, prefix)
    }
  }
})
