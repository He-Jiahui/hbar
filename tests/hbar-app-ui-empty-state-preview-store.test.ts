import { describe, expect, test } from 'bun:test'
import {
  createEmptyStatePreviewSeed,
  createEmptyStatePreviewStore,
} from '../apps/hbar-app-ui-preview/src/emptyStatePreviewStore'
import {
  createEmptyStateLocalizedFixtures,
  createEmptyStatePreviewFixture,
} from './fixtures/hbar-app-ui-empty-state-fixtures'

const spec = { id: 'hbar-app-ui-empty-state-2', variant: 2 }

function createStore(content = createEmptyStatePreviewFixture()) {
  return createEmptyStatePreviewStore(createEmptyStatePreviewSeed(spec, content))
}

describe('Empty State preview store', () => {
  test('seeds domain values only and keeps the owner stable across localized copy', () => {
    const english = createEmptyStatePreviewSeed(spec, createEmptyStatePreviewFixture())
    const german = createEmptyStatePreviewSeed(spec, createEmptyStateLocalizedFixtures('de-long'))

    expect(english).toEqual(german)
    expect(english).toMatchObject({
      variantId: spec.id,
      variant: 2,
      query: 'quaterly revenu',
      filterIds: ['owner', 'status', 'created', 'tag'],
      suggestions: [
        { id: 'quarterly-revenue', query: 'quarterly revenue' },
        { id: 'revenue-region', query: 'revenue by region' },
        { id: 'revenue-forecast', query: 'revenue forecast' },
      ],
    })
    expect(JSON.stringify(english)).not.toContain('Berichte durchsuchen')
  })

  test('removes current filters, clears once, and rejects stale filter callbacks', () => {
    const store = createStore()

    expect(store.getState().activeFilterIds).toHaveLength(4)
    expect(store.getState().removeFilter('status')).toBe(true)
    expect(store.getState().activeFilterIds).toEqual(['owner', 'created', 'tag'])
    expect(store.getState().removeFilter('status')).toBe(false)
    expect(store.getState().clearFilters()).toEqual(['owner', 'created', 'tag'])
    expect(store.getState().activeFilterIds).toEqual([])
    expect(store.getState().clearFilters()).toEqual([])

    store.getState().replaceFilterIds(['owner', ' owner ', 'status', ''])
    expect(store.getState().filterIds).toEqual(['owner', 'status'])
    expect(store.getState().activeFilterIds).toEqual([])
  })

  test('selects a current suggestion as a local query change and rejects stale suggestions', () => {
    const store = createStore()
    const request = store.getState().chooseSuggestion('quarterly-revenue')

    expect(store.getState().query).toBe('quarterly revenue')
    expect(request?.requestId ?? '').toMatch(/^empty-state:\d+:\d+$/)
    expect(request).toMatchObject({
      variantId: spec.id,
      variant: 2,
      actionId: 'select-suggestion',
      targetId: 'quarterly-revenue',
      value: 'quarterly revenue',
      outcome: 'intent-only',
    })
    store.getState().replaceSuggestions([{ id: 'different', query: 'another report' }])
    expect(store.getState().chooseSuggestion('quarterly-revenue')).toBeNull()
    expect(store.getState().query).toBe('quarterly revenue')
  })

  test('deduplicates choice IDs and rejects stale choice targets', () => {
    const store = createStore()
    store.getState().replaceFirstRunChoiceIds(['warehouse', ' warehouse ', 'sample-dataset', ''])

    expect(store.getState().firstRunChoiceIds).toEqual(['warehouse', 'sample-dataset'])
    expect(store.getState().chooseItem('first-run', 'warehouse')).toMatchObject({
      variantId: spec.id,
      actionId: 'select-choice',
      targetId: 'warehouse',
      outcome: 'intent-only',
    })
    expect(store.getState().chooseItem('first-run', 'spreadsheet')).toBeNull()
  })

  test('retries once per target, rejects stale completion, and returns to an unverified failure', () => {
    const store = createStore(createEmptyStatePreviewFixture())
    const otherStore = createStore(createEmptyStateLocalizedFixtures('de'))
    const first = store.getState().startRetry()
    expect(first).not.toBeNull()
    expect(store.getState().startRetry()).toBeNull()
    expect(otherStore.getState().completeRetry(first?.requestId ?? '')).toBe(false)
    expect(store.getState().completeRetry('expired-request')).toBe(false)
    expect(store.getState().completeRetry(first?.requestId ?? '')).toBe(true)
    expect(store.getState()).toMatchObject({ pendingRetry: null, retryOutcome: 'unverified' })
    expect(store.getState().completeRetry(first?.requestId ?? '')).toBe(false)

    const cancelled = store.getState().startRetry()
    expect(cancelled).not.toBeNull()
    expect(store.getState().cancelRetry(cancelled?.requestId ?? '')).toBe(true)
    expect(store.getState().completeRetry(cancelled?.requestId ?? '')).toBe(false)
    expect(store.getState().retryOutcome).toBeNull()
  })

  test('owner cleanup cancels only its retry and keeps the store reusable', () => {
    const store = createStore(createEmptyStatePreviewFixture())
    const pending = store.getState().startRetry()

    store.getState().setSelectedFileCount(2)
    store.getState().setQuery('draft query')
    store.getState().clearOwner()

    expect(store.getState()).toMatchObject({
      pendingRetry: null,
      query: 'draft query',
      selectedFileCount: 2,
    })
    expect(store.getState().completeRetry(pending?.requestId ?? '')).toBe(false)
    const next = store.getState().startRetry()
    expect(next?.requestId).not.toBe(pending?.requestId)
    expect(store.getState().completeRetry(next?.requestId ?? '')).toBe(true)
  })

  test('normalizes file-selection feedback count and preserves natural list capacities', () => {
    const store = createStore(createEmptyStatePreviewFixture())
    store.getState().setSelectedFileCount(Number.POSITIVE_INFINITY)
    expect(store.getState().selectedFileCount).toBe(0)
    store.getState().setSelectedFileCount(3.6)
    expect(store.getState().selectedFileCount).toBe(3)

    const empty = createEmptyStatePreviewFixture('en', 'empty')
    const one = createEmptyStatePreviewFixture('en', 'one')
    const overflow = createEmptyStatePreviewFixture('en', 'overflow')
    expect(empty.noResults?.filters).toHaveLength(0)
    expect(one.noResults?.filters).toHaveLength(1)
    expect(overflow.noResults?.filters).toHaveLength(17)
    expect(overflow.folder?.fileTypes).toHaveLength(17)
  })
})
