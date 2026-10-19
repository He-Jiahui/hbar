import { expect, test } from 'bun:test'
import { runtimePluginStateSchema } from '@hbar/plugin-sdk/runtime-plugin'
import { RuntimePluginCatalogCache } from '../apps/host/src/runtime-plugin-catalog-cache'

function state(name: string) {
  return runtimePluginStateSchema.parse({
    manifests: [{ id: name, name, version: '1', apiVersion: '1', description: '', scope: 'host', permissions: [] }],
    config: {},
    configSchema: null,
    tools: [],
    hooks: [],
    capabilities: { [name]: ['get'] },
  })
}

test('published dependency metadata stays isolated while the complete frontdoor catalog is fenced', () => {
  const cache = new RuntimePluginCatalogCache(['plugin.plan', 'plugin.workflow'])
  const owner = { unitId: 'plugin.plan', generation: 1, incarnation: 'plan-one' }
  const version = { unitId: owner.unitId, generation: 1, artifactId: 'a'.repeat(64) }
  expect(cache.published()).toEqual([])
  expect(() => cache.snapshot()).toThrow('Plugin catalog bootstrap is incomplete')
  cache.publish(owner, version, state('plan'))
  expect(cache.published().map((entry) => entry.unitId)).toEqual(['plugin.plan'])
  expect(() => cache.snapshot()).toThrow('Plugin catalog bootstrap is incomplete')
  const observed = cache.published()
  observed[0]?.state.capabilities.plan?.push('forged-write')
  expect(cache.published()[0]?.state.capabilities.plan).toEqual(['get'])
  cache.publish(
    { unitId: 'plugin.workflow', generation: 1, incarnation: 'workflow-one' },
    { unitId: 'plugin.workflow', generation: 1, artifactId: 'b'.repeat(64) },
    state('workflow'),
  )
  expect(cache.snapshot().map((entry) => entry.unitId)).toEqual(['plugin.plan', 'plugin.workflow'])
})

test('dependency metadata cannot be replaced by an old or unrelated owner', () => {
  const cache = new RuntimePluginCatalogCache(['plugin.plan'])
  cache.publish(
    { unitId: 'plugin.plan', generation: 2, incarnation: 'selected-plan' },
    { unitId: 'plugin.plan', generation: 2, artifactId: 'b'.repeat(64) },
    state('plan'),
  )
  expect(() =>
    cache.publish(
      { unitId: 'plugin.plan', generation: 1, incarnation: 'old-plan' },
      { unitId: 'plugin.plan', generation: 1, artifactId: 'a'.repeat(64) },
      state('forged'),
    ),
  ).toThrow('Plugin catalog metadata is stale')
  expect(() =>
    cache.publish(
      { unitId: 'plugin.plan', generation: 2, incarnation: 'wrong-plan' },
      { unitId: 'plugin.plan', generation: 2, artifactId: 'c'.repeat(64) },
      state('forged'),
    ),
  ).toThrow('Plugin catalog incarnation changed without generation')
  expect(cache.published()[0]?.state.capabilities).toEqual({ plan: ['get'] })
})
