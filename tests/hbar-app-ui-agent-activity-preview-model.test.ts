import { describe, expect, test } from 'bun:test'
import {
  createAgentActivityPreviewStore,
  type AgentActivityPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/agentActivityPreviewStore'

function seed(overrides: Partial<AgentActivityPreviewSeed> = {}): AgentActivityPreviewSeed {
  return {
    ownerId: 'agent-activity:preview',
    variant: 2,
    groupIds: ['prepare', 'extract', 'verify'],
    initialOpenGroupIds: ['prepare', 'extract'],
    filterIds: ['all', 'info', 'warning', 'error'],
    initialFilterId: 'all',
    entryIds: ['line-1', 'line-2', 'line-3'],
    initialVisibleCount: 1,
    initiallyRunning: true,
    historyIds: ['history-1', 'history-2'],
    outputIds: ['ledger.csv', 'run.log'],
    ...overrides,
  }
}

describe('Agent Activity preview model', () => {
  test('normalizes stable IDs and clamps visible log capacity', () => {
    const store = createAgentActivityPreviewStore(
      seed({
        ownerId: '  activity-owner  ',
        groupIds: ['prepare', 'prepare', '  ', 'extract'],
        initialOpenGroupIds: ['extract', 'stale', 'extract'],
        filterIds: ['all', 'all', ' info ', ''],
        initialFilterId: ' info ',
        entryIds: ['line-1', 'line-1', 'line-2'],
        initialVisibleCount: 20,
        initiallyRunning: true,
      }),
    )
    const state = store.getState()

    expect(state.seed.ownerId).toBe('  activity-owner  ')
    expect(state.seed.groupIds).toEqual(['prepare', 'extract'])
    expect(state.openGroupIds).toEqual(['extract'])
    expect(state.seed.filterIds).toEqual(['all', ' info '])
    expect(state.filterId).toBe(' info ')
    expect(state.seed.entryIds).toEqual(['line-1', 'line-2'])
    expect(state.visibleCount).toBe(2)
    expect(state.running).toBe(false)

    const nonFiniteCount = createAgentActivityPreviewStore(
      seed({ initialVisibleCount: Number.POSITIVE_INFINITY, initiallyRunning: true }),
    )
    expect(nonFiniteCount.getState().visibleCount).toBe(0)
    expect(nonFiniteCount.getState().running).toBe(true)
  })

  test('applies only known group and filter selections as local preview state', () => {
    const store = createAgentActivityPreviewStore(seed())

    expect(store.getState().toggleGroup('extract')).toBe(true)
    expect(store.getState().openGroupIds).toEqual(['prepare'])
    expect(store.getState().notice).toBe('local')
    expect(store.getState().toggleGroup('missing')).toBe(false)
    expect(store.getState().selectFilter('warning')).toBe(true)
    expect(store.getState().filterId).toBe('warning')
    expect(store.getState().selectFilter('stale-filter')).toBe(false)
    expect(store.getState().filterId).toBe('warning')
  })

  test('advances one known log entry per tick and freezes without inventing entries', () => {
    const store = createAgentActivityPreviewStore(seed({ variant: 5, initialVisibleCount: 1, initiallyRunning: true }))
    const state = store.getState()

    expect(state.advanceLog()).toBe(true)
    expect(store.getState().visibleCount).toBe(2)
    expect(store.getState().running).toBe(true)
    expect(store.getState().recordIntent('stop')).toBe(false)
    state.stopLog()
    expect(store.getState().visibleCount).toBe(2)
    expect(store.getState().running).toBe(false)
    expect(store.getState().notice).toBe('local')
    expect(store.getState().advanceLog()).toBe(false)
    expect(store.getState().visibleCount).toBe(2)

    const finalTick = createAgentActivityPreviewStore(
      seed({ variant: 5, initialVisibleCount: 2, initiallyRunning: true }),
    )
    expect(finalTick.getState().advanceLog()).toBe(true)
    expect(finalTick.getState().visibleCount).toBe(3)
    expect(finalTick.getState().running).toBe(false)
    expect(finalTick.getState().advanceLog()).toBe(false)
  })

  test('records only known intents for the matching activity and target', () => {
    const historyStore = createAgentActivityPreviewStore(seed({ variant: 4 }))
    expect(historyStore.getState().recordIntent('rerun-history')).toBe(false)
    expect(historyStore.getState().recordIntent('rerun-history', 'missing')).toBe(false)
    expect(historyStore.getState().recordIntent('rerun-history', 'history-1')).toBe(true)
    expect(historyStore.getState().notice).toBe('intent')

    const failureStore = createAgentActivityPreviewStore(seed({ variant: 7 }))
    const originalSeed = failureStore.getState().seed
    expect(failureStore.getState().recordIntent('retry-failure')).toBe(true)
    expect(failureStore.getState().retryQueued).toBe(true)
    expect(failureStore.getState().recordIntent('download-failure-output')).toBe(false)
    expect(failureStore.getState().recordIntent('download-failure-output', 'missing')).toBe(false)
    expect(failureStore.getState().recordIntent('download-failure-output', 'run.log')).toBe(true)
    expect(failureStore.getState().recordIntent('cancel-failure-retry')).toBe(true)
    expect(failureStore.getState().retryQueued).toBe(false)
    expect(failureStore.getState().recordIntent('run-again')).toBe(false)
    expect(failureStore.getState().seed).toEqual(originalSeed)
    expect(failureStore.getState().notice).toBe('intent')

    const deploymentStore = createAgentActivityPreviewStore(
      seed({ variant: 3, entryIds: [], initialVisibleCount: 0, initiallyRunning: false }),
    )
    const deploymentSeed = deploymentStore.getState().seed
    expect(deploymentStore.getState().deploymentStopped).toBe(false)
    expect(deploymentStore.getState().recordIntent('stop')).toBe(true)
    expect(deploymentStore.getState().deploymentStopped).toBe(true)
    expect(deploymentStore.getState().recordIntent('run-again')).toBe(true)
    expect(deploymentStore.getState().deploymentStopped).toBe(false)
    expect(deploymentStore.getState().seed).toEqual(deploymentSeed)
  })

  test('reconciles same-owner lists while preserving valid state and rejecting stale owners', () => {
    const store = createAgentActivityPreviewStore(seed())
    store.getState().toggleGroup('extract')
    store.getState().selectFilter('warning')

    store.getState().reconcile(
      seed({
        groupIds: ['prepare', 'extract', 'review'],
        initialOpenGroupIds: ['review'],
        filterIds: ['all', 'info'],
        initialFilterId: 'all',
        entryIds: ['line-1', 'line-2'],
      }),
    )
    expect(store.getState().openGroupIds).toEqual(['prepare', 'review'])
    expect(store.getState().filterId).toBe('all')
    expect(store.getState().visibleCount).toBe(1)
    expect(store.getState().running).toBe(true)

    store
      .getState()
      .reconcile(seed({ ownerId: 'another-owner', groupIds: ['foreign'], initialOpenGroupIds: ['foreign'] }))
    store.getState().reconcile(seed({ variant: 7, groupIds: ['other-variant'] }))
    expect(store.getState().seed.ownerId).toBe('agent-activity:preview')
    expect(store.getState().seed.variant).toBe(2)
    expect(store.getState().openGroupIds).toEqual(['prepare', 'review'])
  })

  test('creates isolated state per preview owner', () => {
    const first = createAgentActivityPreviewStore(seed({ ownerId: 'first' }))
    const second = createAgentActivityPreviewStore(seed({ ownerId: 'second' }))

    first.getState().toggleGroup('prepare')
    first.getState().selectFilter('error')

    expect(first.getState().openGroupIds).toEqual(['extract'])
    expect(second.getState().openGroupIds).toEqual(['prepare', 'extract'])
    expect(first.getState().filterId).toBe('error')
    expect(second.getState().filterId).toBe('all')
  })
})
