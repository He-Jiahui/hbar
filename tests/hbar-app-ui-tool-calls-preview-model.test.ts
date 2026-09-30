import { describe, expect, test } from 'bun:test'
import {
  createToolCallsPreviewStore,
  type ToolCallsPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/toolCallsPreviewStore'

function seed(overrides: Partial<ToolCallsPreviewSeed> = {}): ToolCallsPreviewSeed {
  return {
    ownerId: 'tool-calls:preview',
    variant: 1,
    traceIds: ['read_file', 'search_incidents', 'write_report'],
    initialOpenTraceIds: ['search_incidents'],
    filterIds: ['all', 'failed', 'running'],
    initialFilterId: 'all',
    retryIds: ['failed-search'],
    diffIds: ['summary.md', 'report.csv'],
    initialOpenDiffIds: ['summary.md'],
    resultIds: ['result-1', 'result-2'],
    outputTabIds: ['stdout', 'stderr'],
    initialOutputTabId: 'stdout',
    permissionItems: [
      {
        groupId: 'files:workspace',
        itemId: 'request:delete',
        kind: 'request',
        enabled: undefined,
        actionIds: ['view', 'approve', 'reject'],
      },
      {
        groupId: 'access:workspace',
        itemId: 'share:external',
        kind: 'toggle',
        enabled: false,
        actionIds: [],
      },
      {
        groupId: 'access:workspace',
        itemId: 'policy-note',
        kind: 'status',
        enabled: undefined,
        actionIds: [],
      },
    ],
    ...overrides,
  }
}

describe('Tool Calls preview model', () => {
  test('normalizes duplicate and blank IDs without rewriting nonblank keys', () => {
    const store = createToolCallsPreviewStore(
      seed({
        ownerId: ' owner with spaces ',
        traceIds: [' trace:one ', ' trace:one ', '  ', 'trace-two'],
        initialOpenTraceIds: ['trace-two', 'missing'],
        filterIds: ['all', 'all', ' failed ', ''],
        initialFilterId: ' failed ',
        diffIds: ['diff:one', 'diff:one', ' '],
        initialOpenDiffIds: ['missing'],
        permissionItems: [
          {
            groupId: 'group:one',
            itemId: 'item:one',
            kind: 'toggle',
            enabled: true,
            actionIds: ['allow', 'allow', ' '],
          },
          {
            groupId: 'group:one',
            itemId: 'item:one',
            kind: 'toggle',
            enabled: false,
            actionIds: [],
          },
        ],
      }),
    )
    const state = store.getState()

    expect(state.seed.ownerId).toBe(' owner with spaces ')
    expect(state.seed.traceIds).toEqual([' trace:one ', 'trace-two'])
    expect(state.openTraceIds).toEqual(['trace-two'])
    expect(state.seed.filterIds).toEqual(['all', ' failed '])
    expect(state.filterId).toBe(' failed ')
    expect(state.seed.diffIds).toEqual(['diff:one'])
    expect(state.openDiffIds).toEqual([])
    expect(state.permissions).toEqual([{ groupId: 'group:one', itemId: 'item:one', enabled: true }])
  })

  test('keeps trace expansion exclusive and rejects stale trace targets', () => {
    const store = createToolCallsPreviewStore(seed())

    expect(store.getState().dispatch({ actionId: 'toggle-trace-item', itemId: 'search_incidents' })).toBe(true)
    expect(store.getState().openTraceIds).toEqual([])
    expect(store.getState().dispatch({ actionId: 'toggle-trace-item', itemId: 'read_file' })).toBe(true)
    expect(store.getState().openTraceIds).toEqual(['read_file'])
    expect(store.getState().dispatch({ actionId: 'toggle-trace-item', itemId: 'missing' })).toBe(false)
    expect(store.getState().openTraceIds).toEqual(['read_file'])
    expect(store.getState().notice).toBe('local')
  })

  test('filters activity locally and records retry/stop as intents only', () => {
    const store = createToolCallsPreviewStore(seed({ variant: 2 }))

    expect(store.getState().dispatch({ actionId: 'filter-tool-activity', optionId: 'failed' })).toBe(true)
    expect(store.getState().filterId).toBe('failed')
    expect(store.getState().notice).toBe('local')
    expect(store.getState().dispatch({ actionId: 'filter-tool-activity', optionId: 'missing' })).toBe(false)
    expect(store.getState().dispatch({ actionId: 'retry-tool-activity', itemId: 'failed-search' })).toBe(true)
    expect(store.getState().notice).toBe('intent')
    expect(store.getState().lastIntent).toEqual({
      actionId: 'retry-tool-activity',
      itemId: 'failed-search',
    })
    expect(store.getState().dispatch({ actionId: 'retry-tool-activity', itemId: 'other' })).toBe(false)
    expect(store.getState().dispatch({ actionId: 'stop' })).toBe(true)
    expect(store.getState().lastIntent).toEqual({ actionId: 'stop' })
    expect(store.getState().dispatch({ actionId: 'copy-command' })).toBe(false)
  })

  test('toggles diff files independently and validates result targets', () => {
    const diffStore = createToolCallsPreviewStore(seed({ variant: 3 }))

    expect(diffStore.getState().dispatch({ actionId: 'toggle-diff-file', itemId: 'summary.md' })).toBe(true)
    expect(diffStore.getState().openDiffIds).toEqual([])
    expect(diffStore.getState().dispatch({ actionId: 'toggle-diff-file', itemId: 'report.csv' })).toBe(true)
    expect(diffStore.getState().openDiffIds).toEqual(['report.csv'])
    expect(diffStore.getState().dispatch({ actionId: 'toggle-diff-file', itemId: 'report.csv' })).toBe(true)
    expect(diffStore.getState().openDiffIds).toEqual([])

    const resultsStore = createToolCallsPreviewStore(seed({ variant: 4 }))
    expect(resultsStore.getState().dispatch({ actionId: 'open-search-result', itemId: 'result-1' })).toBe(true)
    expect(resultsStore.getState().notice).toBe('intent')
    expect(resultsStore.getState().dispatch({ actionId: 'open-search-result', itemId: 'missing' })).toBe(false)
  })

  test('selects command output locally while copy remains an intent', () => {
    const store = createToolCallsPreviewStore(seed({ variant: 5 }))

    expect(store.getState().outputTabId).toBe('stdout')
    expect(store.getState().dispatch({ actionId: 'select-command-output', optionId: 'stderr' })).toBe(true)
    expect(store.getState().outputTabId).toBe('stderr')
    expect(store.getState().notice).toBe('local')
    expect(store.getState().dispatch({ actionId: 'select-command-output', optionId: 'missing' })).toBe(false)
    expect(store.getState().dispatch({ actionId: 'copy-command' })).toBe(true)
    expect(store.getState().notice).toBe('intent')
    expect(store.getState().lastIntent).toEqual({ actionId: 'copy-command' })
  })

  test('opens a request locally but approve/reject do not grant or mutate permission state', () => {
    const store = createToolCallsPreviewStore(seed({ variant: 6 }))
    const request = { groupId: 'files:workspace', itemId: 'request:delete' }
    const initialPermissions = store.getState().permissions

    expect(store.getState().openRequestIds).toEqual([])
    expect(store.getState().dispatch({ actionId: 'permission-request-action', ...request, optionId: 'view' })).toBe(
      true,
    )
    expect(store.getState().openRequestIds).toEqual([request])
    expect(store.getState().notice).toBe('local')

    expect(
      store.getState().dispatch({
        actionId: 'permission-request-action',
        ...request,
        optionId: 'approve',
      }),
    ).toBe(true)
    expect(store.getState().notice).toBe('intent')
    expect(store.getState().lastIntent).toEqual({
      actionId: 'permission-request-action',
      ...request,
      optionId: 'approve',
    })
    expect(store.getState().permissions).toBe(initialPermissions)
    expect(store.getState().openRequestIds).toEqual([request])

    store.getState().reconcile({
      ...seed({ variant: 6 }),
      permissionItems: seed({ variant: 6 }).permissionItems.filter(
        (permission) => permission.itemId !== request.itemId,
      ),
    })
    expect(store.getState().openRequestIds).toEqual([])
    expect(
      store.getState().dispatch({
        actionId: 'permission-request-action',
        ...request,
        optionId: 'approve',
      }),
    ).toBe(false)
  })

  test('changes only known toggle previews and resets them when host authority changes', () => {
    const original = seed({ variant: 6 })
    const store = createToolCallsPreviewStore(original)
    const target = { groupId: 'access:workspace', itemId: 'share:external' }

    expect(store.getState().dispatch({ actionId: 'toggle-permission', ...target, enabled: true })).toBe(true)
    expect(store.getState().permissions).toContainEqual({ ...target, enabled: true })
    expect(store.getState().dispatch({ actionId: 'toggle-permission', ...target, enabled: false })).toBe(true)
    expect(store.getState().permissions).toContainEqual({ ...target, enabled: false })
    expect(
      store.getState().dispatch({
        actionId: 'toggle-permission',
        groupId: 'access:workspace',
        itemId: 'policy-note',
        enabled: true,
      }),
    ).toBe(false)

    store.getState().reconcile({
      ...original,
      permissionItems: original.permissionItems.map((permission) =>
        permission.groupId === target.groupId && permission.itemId === target.itemId
          ? { ...permission, enabled: true }
          : permission,
      ),
    })
    expect(store.getState().permissions).toContainEqual({ ...target, enabled: true })
  })

  test('reconciles same-owner content, prunes stale state and rejects owner/variant changes', () => {
    const store = createToolCallsPreviewStore(seed({ variant: 3 }))
    store.getState().dispatch({ actionId: 'toggle-diff-file', itemId: 'report.csv' })

    store
      .getState()
      .reconcile(seed({ variant: 3, diffIds: ['report.csv', 'new.diff'], initialOpenDiffIds: ['new.diff'] }))
    expect(store.getState().openDiffIds).toEqual(['report.csv', 'new.diff'])

    store.getState().reconcile(seed({ variant: 3, diffIds: ['new.diff'], initialOpenDiffIds: [] }))
    expect(store.getState().openDiffIds).toEqual(['new.diff'])

    store.getState().reconcile(seed({ variant: 3, diffIds: [], initialOpenDiffIds: [] }))
    expect(store.getState().openDiffIds).toEqual([])

    const state = store.getState()
    store
      .getState()
      .reconcile(seed({ ownerId: 'another-owner', variant: 3, diffIds: ['foreign'], initialOpenDiffIds: ['foreign'] }))
    store.getState().reconcile(seed({ variant: 4, diffIds: ['other-variant'] }))
    expect(store.getState().seed.ownerId).toBe(state.seed.ownerId)
    expect(store.getState().seed.variant).toBe(state.seed.variant)
    expect(store.getState().openDiffIds).toEqual([])
  })

  test('keeps independent preview owners isolated', () => {
    const first = createToolCallsPreviewStore(seed({ ownerId: 'first', variant: 3 }))
    const second = createToolCallsPreviewStore(seed({ ownerId: 'second', variant: 3 }))

    first.getState().dispatch({ actionId: 'toggle-diff-file', itemId: 'summary.md' })

    expect(first.getState().openDiffIds).toEqual([])
    expect(second.getState().openDiffIds).toEqual(['summary.md'])
    expect(first.getState().lastIntent).toEqual({ actionId: 'toggle-diff-file', itemId: 'summary.md' })
    expect(second.getState().lastIntent).toBeNull()
  })
})
