import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { Kernel } from '@hbar/kernel'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { IpcPeer, RuntimeValuePort } from '@hbar/runtime'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import { runtimePluginInvocationSchema } from '../apps/host/src/runtime-plugin-contract'
import { RuntimePluginAdapter } from '../apps/host/src/runtime-plugin-adapter'

const roots: string[] = []
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function runtimeManifest(id: string, name: string) {
  return {
    id,
    name,
    description: `${name} runtime fixture`,
    version: '1.0.0',
    apiVersion: '^1.0.0',
    scope: 'host' as const,
    permissions: [],
    ...(id === 'policy.approval' ? { provides: { policy: '1.0.0' } } : {}),
  }
}

function catalog(configMarker: string) {
  return [
    {
      unitId: 'plugin.managed-fixture',
      state: {
        manifests: [
          runtimeManifest('policy.approval', 'Runtime policy'),
          runtimeManifest('managed.adapter.fixture', 'Managed adapter fixture'),
        ],
        config: { marker: configMarker },
        configSchema: { type: 'object', properties: { marker: { type: 'string' } } },
        tools: [],
        hooks: ['session.idle' as const],
        panels: [],
        capabilities: {},
      },
    },
  ]
}

function localPolicyPlugin() {
  return definePlugin({
    manifest: {
      id: 'policy.approval',
      name: 'Explicit profile policy',
      description: 'The profile replacement takes precedence over managed catalog metadata.',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      provides: { policy: '1.0.0' },
      permissions: [],
    },
    apply: (context) => provide(context, 'policy', { decide: async () => 'deny' }),
  })
}

test('managed adapter plugins survive catalog refresh while explicit replacements stay excluded and hooks run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-managed-plugin-adapter-'))
  roots.push(root)
  const kernelOwner: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'managed-adapter-kernel' }
  const hostOwner: RuntimeOwner = { unitId: 'host', generation: 1, incarnation: 'managed-adapter-host' }
  let kernelPeer: IpcPeer | undefined
  let hostPeer: IpcPeer | undefined
  kernelPeer = new IpcPeer({
    owner: kernelOwner,
    remote: hostOwner,
    transport: { send: (frame) => hostPeer?.receive(frame) },
  })
  hostPeer = new IpcPeer({
    owner: hostOwner,
    remote: kernelOwner,
    transport: { send: (frame) => kernelPeer?.receive(frame) },
  })
  let currentCatalog = catalog('initial-owner-config')
  let hookCalls = 0
  const ownerValues = new RuntimeValuePort(hostPeer, { prefix: 'kernel.plugins' })
  ownerValues.register('catalog', () => currentCatalog)
  ownerValues.register('invoke', (args) => {
    const request = runtimePluginInvocationSchema.parse(args[2])
    if (request.operation === 'hook' && request.name === 'session.idle') hookCalls++
    return { kind: 'value', value: isUnknownArray(args[3]) ? args[3][0] : null }
  })

  let kernel: Kernel | undefined
  const adapter = new RuntimePluginAdapter(kernelPeer, () => {
    if (!kernel) throw new Error('Kernel is not ready')
    return kernel
  })
  try {
    const managedPlugins = await adapter.load(['policy.approval'])
    expect(managedPlugins.map((plugin) => plugin.manifest.id)).toEqual(['managed.adapter.fixture'])
    kernel = await Kernel.create({
      home: join(root, 'data'),
      demo: true,
      secrets: new MemorySecrets(),
      profile: { replacements: { 'policy.approval': localPolicyPlugin() }, managedPlugins },
    })
    adapter.publishMetadata()

    expect(kernel.plugins.list().find((plugin) => plugin.id === 'policy.approval')).toMatchObject({
      name: 'Explicit profile policy',
      description: 'The profile replacement takes precedence over managed catalog metadata.',
    })
    expect(kernel.plugins.list().find((plugin) => plugin.id === 'managed.adapter.fixture')).toMatchObject({
      status: 'active',
      config: { marker: 'initial-owner-config' },
      configSchema: { properties: { marker: { type: 'string' } } },
    })

    await kernel.hooks.dispatch('session.idle', { sessionId: 'managed-adapter-session' })
    expect(hookCalls).toBe(1)

    currentCatalog = catalog('refreshed-owner-config')
    await adapter.refresh()
    expect(kernel.plugins.list().find((plugin) => plugin.id === 'policy.approval')).toMatchObject({
      name: 'Explicit profile policy',
      description: 'The profile replacement takes precedence over managed catalog metadata.',
    })
    expect(kernel.plugins.list().find((plugin) => plugin.id === 'managed.adapter.fixture')?.config).toEqual({
      marker: 'refreshed-owner-config',
    })
    await kernel.hooks.dispatch('session.idle', { sessionId: 'managed-adapter-session' })
    expect(hookCalls).toBe(2)

    currentCatalog = [...catalog('duplicate-owner-config'), ...catalog('duplicate-owner-config')].map(
      (entry, index) => ({
        ...entry,
        unitId: `plugin.managed-fixture-${index}`,
      }),
    )
    const duplicateRefresh = await adapter.refresh().catch((error: unknown) => error)
    expect(duplicateRefresh).toBeInstanceOf(HbarError)
    expect(duplicateRefresh).toMatchObject({ code: 'PLUGIN_CONFLICT' })
    expect(kernel.plugins.list().find((plugin) => plugin.id === 'managed.adapter.fixture')?.config).toEqual({
      marker: 'refreshed-owner-config',
    })
    const duplicateCatalog = await adapter.load(['policy.approval']).catch((error: unknown) => error)
    expect(duplicateCatalog).toBeInstanceOf(HbarError)
    expect(duplicateCatalog).toMatchObject({ code: 'PLUGIN_CONFLICT' })
  } finally {
    await kernel?.close()
    adapter.dispose()
    ownerValues.dispose()
    kernelPeer.close()
    hostPeer.close()
  }
})
