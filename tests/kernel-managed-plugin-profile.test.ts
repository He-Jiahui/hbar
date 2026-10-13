import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { Kernel } from '@hbar/kernel'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import { z } from 'zod'

const roots: string[] = []
const kernels = new Set<Kernel>()
afterEach(async () => {
  await Promise.all(
    [...kernels].map(async (kernel) => {
      kernels.delete(kernel)
      await kernel.close()
    }),
  )
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function createKernel(profile: NonNullable<Parameters<typeof Kernel.create>[0]['profile']>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-managed-plugin-profile-'))
  roots.push(root)
  const kernel = await Kernel.create({ home: join(root, 'data'), demo: true, secrets: new MemorySecrets(), profile })
  kernels.add(kernel)
  return kernel
}

function policyPlugin(onApply: () => void) {
  return definePlugin({
    manifest: {
      id: 'policy.approval',
      name: 'Fixture policy replacement',
      description: 'Confirms managed built-ins replace their registered defaults.',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      provides: { policy: '1.0.0' },
      permissions: [],
    },
    apply: (context) => {
      onApply()
      provide(context, 'policy', { decide: async () => 'deny' })
    },
  })
}

function managedHookPlugin(observedMarkers: string[]) {
  const configSchema = z.object({ marker: z.string().default('runtime-default') })
  return definePlugin({
    manifest: {
      id: 'managed.profile.fixture',
      name: 'Managed profile fixture',
      description: 'A new managed plugin with an observable Session hook.',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
    },
    configSchema,
    apply: (context, value) => {
      const config = configSchema.parse(value)
      context.hbar.api.hooks.on('session.idle', (event) => {
        observedMarkers.push(config.marker)
        return event
      })
    },
  })
}

test('managed plugins replace registered built-ins, add new IDs, accept config, and run hooks', async () => {
  const observedMarkers: string[] = []
  let replacementMounted = false
  const kernel = await createKernel({
    managedPlugins: [policyPlugin(() => (replacementMounted = true)), managedHookPlugin(observedMarkers)],
  })
  try {
    const plugins = kernel.plugins.list()
    expect(plugins.find((plugin) => plugin.id === 'policy.approval')).toMatchObject({
      name: 'Fixture policy replacement',
      description: 'Confirms managed built-ins replace their registered defaults.',
    })
    expect(plugins.find((plugin) => plugin.id === 'managed.profile.fixture')).toMatchObject({
      status: 'active',
      config: { marker: 'runtime-default' },
    })
    expect(replacementMounted).toBe(true)
    await kernel.plugins.set('managed.profile.fixture', true, { marker: 'configured' })
    await kernel.hooks.dispatch('session.idle', { sessionId: 'managed-profile-session' })
    expect(observedMarkers).toEqual(['configured'])
    expect(kernel.plugins.list().find((plugin) => plugin.id === 'managed.profile.fixture')?.config).toEqual({
      marker: 'configured',
    })
  } finally {
    kernels.delete(kernel)
    await kernel.close()
  }
})

test('managed built-in replacement keeps compatibility checks and legacy replacement keys', async () => {
  const baseManifest = policyPlugin(() => {}).manifest
  const incompatibleVersion = definePlugin({
    manifest: { ...baseManifest, provides: { policy: '2.0.0' } },
    apply: (context) => provide(context, 'policy', { decide: async () => 'deny' }),
  })
  const versionResult = await createKernel({ managedPlugins: [incompatibleVersion] }).catch((error: unknown) => error)
  expect(versionResult).toBeInstanceOf(HbarError)
  expect(versionResult).toMatchObject({ code: 'PLUGIN_DEPENDENCY' })

  const incompatibleScope = definePlugin({
    manifest: { ...baseManifest, scope: 'workspace' },
    apply: (context) => provide(context, 'policy', { decide: async () => 'deny' }),
  })
  const scopeResult = await createKernel({ managedPlugins: [incompatibleScope] }).catch((error: unknown) => error)
  expect(scopeResult).toBeInstanceOf(HbarError)
  expect(scopeResult).toMatchObject({ code: 'PLUGIN_SCOPE' })

  const legacyReplacement = definePlugin({
    manifest: {
      ...policyPlugin(() => {}).manifest,
      id: 'legacy.policy.implementation',
    },
    apply: (context) => provide(context, 'policy', { decide: async () => 'deny' }),
  })
  const kernel = await createKernel({ replacements: { 'policy.approval': legacyReplacement } })
  expect(kernel.plugins.list().find((plugin) => plugin.id === 'legacy.policy.implementation')).toBeDefined()
})

test('duplicate and conflicting KernelProfile plugin IDs fail explicitly', async () => {
  const duplicate = managedHookPlugin([])
  const duplicateResult = await createKernel({ managedPlugins: [duplicate, duplicate] }).catch(
    (error: unknown) => error,
  )
  expect(duplicateResult).toBeInstanceOf(HbarError)
  expect(duplicateResult).toMatchObject({ code: 'PLUGIN_CONFLICT' })

  const repeatedAcrossLists = managedHookPlugin([])
  const listConflict = await createKernel({
    plugins: [repeatedAcrossLists],
    managedPlugins: [repeatedAcrossLists],
  }).catch((error: unknown) => error)
  expect(listConflict).toBeInstanceOf(HbarError)
  expect(listConflict).toMatchObject({ code: 'PLUGIN_CONFLICT' })

  const replacementConflict = policyPlugin(() => {})
  const replacementManagedConflict = await createKernel({
    replacements: { 'policy.approval': replacementConflict },
    managedPlugins: [policyPlugin(() => {})],
  }).catch((error: unknown) => error)
  expect(replacementManagedConflict).toBeInstanceOf(HbarError)
  expect(replacementManagedConflict).toMatchObject({ code: 'PLUGIN_CONFLICT' })
})
