import { describe, expect, test } from 'bun:test'
import {
  createMonitoringPreviewStore,
  type MonitoringPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/monitoringPreviewModel'

function makeSeed(overrides: Partial<MonitoringPreviewSeed> = {}): MonitoringPreviewSeed {
  return {
    ownerId: 'monitoring-owner-a',
    variant: 7,
    fixtureId: 'monitoring-fixture-a',
    items: [
      { id: 'node-a', groupId: 'group-a', expandedByDefault: true },
      { id: 'node-b', groupId: 'group-b' },
      { id: 'node-a', groupId: 'duplicate' },
      { id: ' ', groupId: 'ignored' },
    ],
    choices: [
      { field: 'region', ids: ['all', 'eu-west'], initialId: 'eu-west' },
      { field: 'metric', ids: ['requests', 'latency'], initialId: 'requests' },
    ],
    groups: [{ id: 'group-a', expandedByDefault: true }, { id: 'group-b' }],
    initialSelectedId: 'node-a',
    initialSortId: 'cpu',
    initialDescending: true,
    requestActions: [
      { actionId: 'refresh' },
      { actionId: 'options', value: 'node-a' },
      { actionId: 'options', value: 'node-a' },
    ],
    ...overrides,
  }
}

describe('monitoring preview owned state', () => {
  test('normalizes source data, scopes owners, preserves choices, and guards exact requests', () => {
    const first = createMonitoringPreviewStore(makeSeed())
    const second = createMonitoringPreviewStore(makeSeed({ ownerId: 'monitoring-owner-b', fixtureId: 'fixture-b' }))
    const state = first.getState()

    expect(state.items.map(({ id }) => id)).toEqual(['node-a', 'node-b'])
    expect(state.groups.map(({ id }) => id)).toEqual(['group-a', 'group-b'])
    expect(state.requestActions).toEqual([{ actionId: 'refresh' }, { actionId: 'options', value: 'node-a' }])
    expect(state.choiceIds).toEqual({ region: 'eu-west', metric: 'requests' })
    expect(state.selectedId).toBe('node-a')
    expect(state.expandedIds).toEqual(['node-a'])
    expect(state.expandedGroupIds).toEqual(['group-a'])
    expect(state.setQuery('monitoring-owner-b', 'wrong')).toBe(false)
    expect(state.setQuery('monitoring-owner-a', 'api')).toBe(true)
    expect(state.choose('monitoring-owner-a', 'region', 'all')).toBe(true)
    expect(state.choose('monitoring-owner-a', 'region', 'missing')).toBe(false)
    expect(state.sort('monitoring-owner-a', 'errors', false)).toBe(true)
    expect(state.request('monitoring-owner-a', 'options', 'node-a')).toBe(true)
    expect(state.request('monitoring-owner-a', 'options', 'node-a')).toBe(false)
    expect(state.request('monitoring-owner-a', 'options')).toBe(false)
    expect(state.request('monitoring-owner-b', 'refresh')).toBe(false)
    expect(second.getState().choiceIds).toEqual({ region: 'eu-west', metric: 'requests' })
  })

  test('refresh keeps eligible local state, applies first fallbacks, prunes stale IDs, and invalidates context requests', () => {
    const store = createMonitoringPreviewStore(makeSeed())
    const state = store.getState()
    expect(state.setQuery('monitoring-owner-a', 'keep')).toBe(true)
    expect(state.choose('monitoring-owner-a', 'region', 'all')).toBe(true)
    expect(state.select('monitoring-owner-a', 'node-b')).toBe(true)
    expect(state.expand('monitoring-owner-a', 'node-b')).toBe(true)
    expect(state.request('monitoring-owner-a', 'options', 'node-b')).toBe(false)
    expect(state.request('monitoring-owner-a', 'refresh')).toBe(true)

    expect(
      state.refresh({
        ...makeSeed(),
        items: [
          { id: 'node-b', groupId: 'group-c' },
          { id: 'node-c', groupId: 'group-c' },
        ],
        choices: [{ field: 'region', ids: ['eu-central'], initialId: 'missing' }],
        groups: [{ id: 'group-c', expandedByDefault: true }],
        requestActions: [{ actionId: 'refresh' }],
      }),
    ).toBe(true)
    const refreshed = store.getState()
    expect(refreshed.query).toBe('keep')
    expect(refreshed.choiceIds).toEqual({ region: 'eu-central' })
    expect(refreshed.selectedId).toBe('node-b')
    expect(refreshed.expandedIds).toEqual(['node-b'])
    expect(refreshed.expandedGroupIds).toEqual(['group-c'])
    expect(refreshed.lastRequest).toBeUndefined()

    expect(state.refresh({ ...makeSeed(), ownerId: 'other-owner' })).toBe(false)
    expect(state.refresh({ ...makeSeed(), variant: 8 })).toBe(false)
    expect(state.refresh({ ...makeSeed(), fixtureId: 'other-fixture' })).toBe(false)
  })

  test('incident drafts, alert actions, queue groups, and bounded local changes stay variant scoped', () => {
    const incident = createMonitoringPreviewStore(
      makeSeed({
        variant: 3,
        items: [{ id: 'update-a' }],
        choices: [{ field: 'status', ids: ['open'], initialId: 'open' }],
      }),
    )
    const incidentState = incident.getState()
    expect(incidentState.setDraft('monitoring-owner-a', '  update  ')).toBe(true)
    expect(incidentState.post('monitoring-owner-a')).toBe(true)
    expect(incident.getState().draft).toBe('')
    expect(incident.getState().localUpdates).toEqual([{ id: 'local-update-1', body: '  update  ', statusId: 'open' }])
    expect(incidentState.setDraft('monitoring-owner-a', 'x'.repeat(4_001))).toBe(false)
    expect(incidentState.post('monitoring-owner-a')).toBe(false)

    const alerts = createMonitoringPreviewStore(
      makeSeed({
        variant: 4,
        items: [
          { id: 'firing-a', stateId: 'firing' },
          { id: 'resolved-a', stateId: 'firing' },
          { id: 'ok-a', stateId: 'ok' },
        ],
      }),
    )
    const alertState = alerts.getState()
    expect(alertState.silence('monitoring-owner-a', 'firing-a')).toBe(true)
    expect(alertState.resolve('monitoring-owner-a', 'resolved-a')).toBe(true)
    expect(alertState.silenceFiring('monitoring-owner-a')).toBe(true)
    expect(alerts.getState().mutedIds).toEqual(['firing-a'])
    expect(alerts.getState().resolvedIds).toEqual(['resolved-a'])
    expect(alertState.resetAlerts('monitoring-owner-a')).toBe(true)
    expect(alerts.getState().mutedIds).toEqual([])
    expect(alerts.getState().resolvedIds).toEqual([])

    const queue = createMonitoringPreviewStore(makeSeed({ variant: 9, groups: [{ id: 'a' }, { id: 'b' }] }))
    const queueState = queue.getState()
    expect(queueState.group('monitoring-owner-a', 'a')).toBe(true)
    expect(queueState.allGroups('monitoring-owner-a', true)).toBe(true)
    expect(queue.getState().expandedGroupIds).toEqual(['a', 'b'])
    expect(queueState.toggleAttention('monitoring-owner-a')).toBe(true)
    expect(queue.getState().attention).toBe(true)
    expect(queueState.clear('monitoring-owner-a')).toBe(false)
  })
})
