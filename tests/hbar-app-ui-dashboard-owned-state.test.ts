import { expect, test } from 'bun:test'
import {
  createDashboardPreviewStore,
  type DashboardPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/dashboardPreviewModel'

function makeSeed(overrides: Partial<DashboardPreviewSeed> = {}): DashboardPreviewSeed {
  return {
    ownerId: 'dashboard-owner-a',
    variant: 2,
    fixtureId: 'fixture-a',
    slots: [
      {
        id: 'range',
        initialId: '7d',
        items: [{ id: '24h' }, { id: '7d' }, { id: '30d' }],
      },
      {
        id: 'metric',
        initialId: 'runs',
        items: [{ id: 'runs' }, { id: 'cost' }],
      },
      {
        id: 'service',
        items: [{ id: 'api' }, { id: 'worker' }],
      },
    ],
    flags: [
      { id: 'compare', value: false },
      { id: 'descending', value: false },
      { id: 'filter-open', value: false },
    ],
    requestActions: [{ actionId: 'export' }, { actionId: 'open', value: 'api' }, { actionId: 'sweep' }],
    query: '',
    ...overrides,
  }
}

test('dashboard seed normalization is first-wins and uses enabled fallback choices', () => {
  const store = createDashboardPreviewStore(
    makeSeed({
      slots: [
        {
          id: 'range',
          initialId: 'disabled',
          items: [
            { id: 'disabled', disabled: true },
            { id: ' first ' },
            { id: ' first ', disabled: true },
            { id: '   ' },
          ],
        },
        { id: 'empty', items: [{ id: 'blocked', disabled: true }] },
        { id: 'range', items: [{ id: 'ignored' }] },
        { id: ' ', items: [{ id: 'ignored-blank-slot' }] },
      ],
      flags: [
        { id: 'compare', value: true },
        { id: 'compare', value: false },
        { id: ' ', value: true },
      ],
      requestActions: [
        { actionId: 'export' },
        { actionId: 'export' },
        { actionId: 'open', value: ' target ' },
        { actionId: 'open', value: ' target ' },
        { actionId: 'open', value: '   ' },
        { actionId: ' ', value: 'ignored' },
      ],
    }),
  )

  const state = store.getState()
  expect(state.slots.map(({ id, items }) => [id, items.map(({ id: itemId }) => itemId)])).toEqual([
    ['range', ['disabled', ' first ']],
    ['empty', ['blocked']],
  ])
  expect(state.selectedBySlot).toEqual({ range: ' first ', empty: undefined })
  expect(state.flags).toEqual([{ id: 'compare', value: true }])
  expect(state.flagsById).toEqual({ compare: true })
  expect(state.requestActions).toEqual([{ actionId: 'export' }, { actionId: 'open', value: ' target ' }])
  expect(state.select(state.ownerId, 'range', 'disabled')).toBe(false)
  expect(state.select(state.ownerId, 'empty', 'blocked')).toBe(false)
})

test('dashboard empty, one-item, and boundary slots remain explicit after list mutation', () => {
  const boundaryItems = Array.from({ length: 80 }, (_, index) => ({ id: `item-${index}` }))
  const store = createDashboardPreviewStore(
    makeSeed({
      slots: [
        { id: 'empty', items: [] },
        { id: 'one', items: [{ id: 'only' }], initialId: 'missing' },
        { id: 'boundary', items: boundaryItems, initialId: 'item-79' },
      ],
    }),
  )
  const ownerId = store.getState().ownerId
  const stale = store.getState()
  expect(store.getState().selectedBySlot).toEqual({ empty: undefined, one: 'only', boundary: 'item-79' })
  expect(store.getState().select(ownerId, 'boundary', 'item-0')).toBe(true)
  expect(store.getState().select(ownerId, 'boundary', 'item-79')).toBe(true)
  expect(
    store.getState().refresh(
      makeSeed({
        slots: [
          { id: 'empty', items: [] },
          { id: 'one', items: [{ id: 'only' }] },
          { id: 'boundary', items: [{ id: 'item-0' }, { id: 'item-80' }] },
        ],
      }),
    ),
  ).toBe(true)
  expect(store.getState().selectedBySlot).toEqual({ empty: undefined, one: 'only', boundary: 'item-0' })
  expect(stale.select(ownerId, 'boundary', 'item-79')).toBe(false)
})

test('dashboard selections, flags, query and requests stay scoped to their owner and exact targets', () => {
  const first = createDashboardPreviewStore(makeSeed())
  const second = createDashboardPreviewStore(makeSeed({ ownerId: 'dashboard-owner-b' }))
  const ownerId = first.getState().ownerId

  expect(first.getState().select('other-owner', 'range', '24h')).toBe(false)
  expect(first.getState().setFlag('other-owner', 'compare', true)).toBe(false)
  expect(first.getState().setQuery('other-owner', 'ignored')).toBe(false)
  expect(first.getState().request('other-owner', { actionId: 'export' })).toBeUndefined()
  expect(first.getState().select(ownerId, 'range', 'missing')).toBe(false)
  expect(first.getState().setFlag(ownerId, 'missing', true)).toBe(false)
  expect(first.getState().request(ownerId, { actionId: 'open', value: 'worker' })).toBeUndefined()
  expect(first.getState().request(ownerId, { actionId: 'open', value: ' api' })).toBeUndefined()

  const exportRequest = first.getState().request(ownerId, { actionId: 'export' })
  expect(exportRequest).toEqual({ ownerId, variant: 2, fixtureId: 'fixture-a', actionId: 'export' })
  expect(first.getState().request(ownerId, { actionId: 'export' })).toBeUndefined()
  expect(first.getState().setQuery(ownerId, 'payments')).toBe(true)
  expect(first.getState().query).toBe('payments')
  expect(first.getState().lastRequest).toBeUndefined()
  expect(first.getState().setFlag(ownerId, 'compare', true)).toBe(true)
  expect(first.getState().flagsById.compare).toBe(true)

  expect(first.getState().select(ownerId, 'range', '30d')).toBe(true)
  expect(first.getState().selectedBySlot.range).toBe('30d')
  expect(second.getState().selectedBySlot.range).toBe('7d')
  expect(second.getState().flagsById.compare).toBe(false)
  expect(second.getState().query).toBe('')
})

test('dashboard refresh preserves live values, falls back safely, and prunes stale flags and intent', () => {
  const store = createDashboardPreviewStore(
    makeSeed({
      query: 'owner query',
      flags: [
        { id: 'compare', value: false },
        { id: 'removed', value: true },
      ],
      requestActions: [{ actionId: 'open', value: 'api' }],
    }),
  )
  const ownerId = store.getState().ownerId
  expect(store.getState().select(ownerId, 'range', '30d')).toBe(true)
  expect(store.getState().setFlag(ownerId, 'compare', true)).toBe(true)
  expect(store.getState().setQuery(ownerId, 'kept query')).toBe(true)
  expect(store.getState().request(ownerId, { actionId: 'open', value: 'api' })).toBeDefined()

  expect(
    store.getState().refresh(
      makeSeed({
        slots: [
          { id: 'range', items: [{ id: '30d', disabled: true }, { id: '90d' }], initialId: '30d' },
          { id: 'metric', items: [{ id: 'cost' }] },
          { id: 'service', items: [] },
        ],
        flags: [{ id: 'compare', value: false }],
        requestActions: [{ actionId: 'export' }],
        query: 'host replacement should not overwrite local query',
      }),
    ),
  ).toBe(true)

  const refreshed = store.getState()
  expect(refreshed.selectedBySlot).toEqual({ range: '90d', metric: 'cost', service: undefined })
  expect(refreshed.flagsById).toEqual({ compare: true })
  expect(refreshed.query).toBe('kept query')
  expect(refreshed.lastRequest).toBeUndefined()
  expect(refreshed.request(ownerId, { actionId: 'open', value: 'api' })).toBeUndefined()
  expect(refreshed.request(ownerId, { actionId: 'export' })).toBeDefined()

  expect(store.getState().refresh(makeSeed({ ownerId: 'dashboard-owner-b' }))).toBe(false)
  expect(store.getState().refresh(makeSeed({ variant: 9 }))).toBe(false)
  expect(store.getState().refresh(makeSeed({ fixtureId: 'fixture-b' }))).toBe(false)
})

test('dashboard refresh keeps an allowlisted request when its exact target remains live', () => {
  const store = createDashboardPreviewStore(makeSeed({ requestActions: [{ actionId: 'sweep' }] }))
  const ownerId = store.getState().ownerId
  expect(store.getState().request(ownerId, { actionId: 'sweep' })).toBeDefined()
  expect(store.getState().refresh(makeSeed({ requestActions: [{ actionId: 'sweep' }] }))).toBe(true)
  expect(store.getState().lastRequest).toEqual({
    ownerId,
    variant: 2,
    fixtureId: 'fixture-a',
    actionId: 'sweep',
  })
})
