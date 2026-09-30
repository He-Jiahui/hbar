import { describe, expect, test } from 'bun:test'
import {
  createIntegrationReferencePreviewStore,
  type IntegrationReferencePreviewSeed,
} from '../apps/hbar-app-ui-preview/src/integrationReferencePreviewStore'

function seed(patch: Partial<IntegrationReferencePreviewSeed> = {}): IntegrationReferencePreviewSeed {
  return {
    ownerId: 'integration-test',
    kind: 'marketplace',
    targetIds: [],
    initialSelectionId: null,
    scopes: [],
    keyIds: [],
    endpoints: [],
    deliveries: [],
    initialExpandedIds: [],
    sources: [],
    ...patch,
  }
}

describe('Integration reference preview owner', () => {
  test('isolates owners, preserves queries and safely reconciles deleted category/workspace IDs', () => {
    const input = seed({ targetIds: ['all', 'analytics', 'analytics', ''], initialSelectionId: 'all' })
    const first = createIntegrationReferencePreviewStore(input)
    const second = createIntegrationReferencePreviewStore(input)
    first.getState().setQuery('Northwind')
    expect(first.getState().select('analytics')).toBe(true)
    expect(first.getState().select('missing')).toBe(false)
    expect(second.getState().query).toBe('')
    expect(second.getState().selectionId).toBe('all')
    first.getState().reconcile({ ...input, targetIds: ['all'] })
    expect(first.getState().query).toBe('Northwind')
    expect(first.getState().selectionId).toBe('all')
    first.getState().reconcile({ ...input, ownerId: 'other-workspace' })
    expect(first.getState().seed.ownerId).toBe('integration-test')
    first.getState().reconcile({ ...input, targetIds: [] })
    expect(first.getState().selectionId).toBeNull()
  })
  test('keeps required scopes immutable and accepts authoritative scope refreshes', () => {
    const input = seed({
      kind: 'connection',
      scopes: [
        { id: 'required', enabled: true, required: true },
        { id: 'issues', enabled: true, required: false },
      ],
    })
    const store = createIntegrationReferencePreviewStore(input)
    expect(store.getState().setScope('required', false)).toBe(false)
    expect(store.getState().setScope('issues', false)).toBe(true)
    expect(store.getState().setScope('missing', true)).toBe(false)
    store.getState().reconcile({ ...input, scopes: input.scopes.map((item) => ({ ...item })) })
    expect(store.getState().scopes.find((item) => item.scopeId === 'issues')?.enabled).toBe(false)
    store.getState().reconcile({ ...input, scopes: [{ id: 'issues', enabled: true, required: true }] })
    expect(store.getState().scopes).toEqual([{ scopeId: 'issues', enabled: true }])
  })
  test('stores reveal IDs only, rejects stale keys, and does not share reveal state between mounts', () => {
    const input = seed({ kind: 'api-keys', keyIds: ['first', 'second', 'first', ''] })
    const store = createIntegrationReferencePreviewStore(input)
    expect(store.getState().toggleReveal('first')).toBe(true)
    expect(store.getState().toggleReveal('removed')).toBe(false)
    expect(store.getState().revealedIds).toEqual(['first'])
    expect(createIntegrationReferencePreviewStore(input).getState().revealedIds).toEqual([])
    store.getState().reconcile({ ...input, keyIds: ['second'] })
    expect(store.getState().revealedIds).toEqual([])
    expect(Object.keys(store.getState())).not.toContain('tokens')
  })
  test('binds webhook expansion to its original endpoint and preserves unrelated endpoint settings', () => {
    const input = seed({
      kind: 'webhooks',
      targetIds: ['northwind', 'cedar'],
      initialSelectionId: 'northwind',
      endpoints: [
        { endpointId: 'northwind', enabled: true },
        { endpointId: 'cedar', enabled: true },
      ],
      deliveries: [{ id: 'delivery', endpointId: 'northwind' }],
      initialExpandedIds: ['delivery', 'removed'],
    })
    const store = createIntegrationReferencePreviewStore(input)
    expect(store.getState().expandedIds).toEqual(['delivery'])
    expect(store.getState().setEndpoint('northwind', false)).toBe(true)
    expect(store.getState().endpoints[1]?.enabled).toBe(true)
    store.getState().select('cedar')
    expect(store.getState().toggleDelivery('northwind', 'delivery')).toBe(false)
    expect(store.getState().toggleDelivery('cedar', 'delivery')).toBe(false)
    store.getState().reconcile({
      ...input,
      targetIds: ['cedar'],
      endpoints: [{ endpointId: 'cedar', enabled: true }],
      deliveries: [],
    })
    expect(store.getState().selectionId).toBe('cedar')
    expect(store.getState().expandedIds).toEqual([])
    expect(store.getState().setEndpoint('northwind', true)).toBe(false)
  })
  test('infers local pause/resume only and never marks a failed source healthy', () => {
    const input = seed({
      kind: 'sync',
      sources: [
        { sourceId: 'northwind', phase: 'syncing' },
        { sourceId: 'meridian', phase: 'failed' },
        { sourceId: 'quarry', phase: 'paused' },
      ],
    })
    const store = createIntegrationReferencePreviewStore(input)
    expect(store.getState().toggleSource('northwind')).toBe(true)
    expect(store.getState().sources[0]?.phase).toBe('paused')
    expect(store.getState().toggleSource('northwind')).toBe(true)
    expect(store.getState().sources[0]?.phase).toBe('syncing')
    expect(store.getState().toggleSource('meridian')).toBe(true)
    expect(store.getState().sources[1]?.phase).toBe('syncing')
    expect(store.getState().sources.some((item) => item.phase === 'healthy')).toBe(false)
    expect(store.getState().toggleSource('retired')).toBe(false)
    store.getState().reconcile({ ...input, sources: [{ sourceId: 'meridian', phase: 'healthy' }] })
    expect(store.getState().sources).toEqual([{ sourceId: 'meridian', phase: 'healthy' }])
  })
})
