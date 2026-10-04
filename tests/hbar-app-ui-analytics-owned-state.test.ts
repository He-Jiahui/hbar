import { expect, test } from 'bun:test'
import {
  createAnalyticsPreviewStore,
  type AnalyticsPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/analyticsPreviewModel'

function makeSeed(overrides: Partial<AnalyticsPreviewSeed> = {}): AnalyticsPreviewSeed {
  return {
    ownerId: 'analytics-owner-a',
    variant: 1,
    fixtureId: 'analytics-fixture-a',
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
        id: 'cursorpoint',
        items: [{ id: 'point-1' }, { id: 'point-2' }],
      },
    ],
    flags: [
      { id: 'series-runs', value: true },
      { id: 'series-reviews', value: false },
      { id: 'paused', value: false },
      { id: 'totals', value: true },
    ],
    requestActions: [{ actionId: 'inspect' }, { actionId: 'open', value: 'runs' }, { actionId: 'open', value: 'cost' }],
    ...overrides,
  }
}

test('analytics seed normalization is first-wins and falls back to the first enabled item', () => {
  const store = createAnalyticsPreviewStore(
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
        { id: 'totals', value: false },
        { id: 'totals', value: true },
        { id: ' ', value: true },
      ],
      requestActions: [
        { actionId: 'inspect' },
        { actionId: 'inspect' },
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
  expect(state.flags).toEqual([{ id: 'totals', value: false }])
  expect(state.flagsById).toEqual({ totals: false })
  expect(state.requestActions).toEqual([{ actionId: 'inspect' }, { actionId: 'open', value: ' target ' }])
  expect(state.select(state.ownerId, 'range', 'disabled')).toBe(false)
  expect(state.select(state.ownerId, 'empty', 'blocked')).toBe(false)
})

test('analytics empty, one-item, 80-item, and 81-item slots preserve explicit capacity', () => {
  const normalItems = Array.from({ length: 80 }, (_, index) => ({ id: `point-${index}` }))
  const overBoundaryItems = Array.from({ length: 81 }, (_, index) => ({ id: `cell-${index}` }))
  const store = createAnalyticsPreviewStore(
    makeSeed({
      slots: [
        { id: 'empty', items: [] },
        { id: 'one', items: [{ id: 'only' }], initialId: 'missing' },
        { id: 'normal', items: normalItems, initialId: 'point-79' },
        { id: 'over', items: overBoundaryItems, initialId: 'cell-80' },
      ],
    }),
  )
  const ownerId = store.getState().ownerId
  expect(store.getState().selectedBySlot).toEqual({
    empty: undefined,
    one: 'only',
    normal: 'point-79',
    over: 'cell-80',
  })
  expect(store.getState().slots.find(({ id }) => id === 'empty')?.items).toHaveLength(0)
  expect(store.getState().slots.find(({ id }) => id === 'one')?.items).toHaveLength(1)
  expect(store.getState().slots.find(({ id }) => id === 'normal')?.items).toHaveLength(80)
  expect(store.getState().slots.find(({ id }) => id === 'over')?.items).toHaveLength(81)
  expect(store.getState().select(ownerId, 'normal', 'point-0')).toBe(true)
  expect(store.getState().select(ownerId, 'normal', 'point-79')).toBe(true)
  expect(store.getState().select(ownerId, 'over', 'cell-80')).toBe(true)
  expect(store.getState().selectedBySlot.normal).toBe('point-79')
  expect(store.getState().selectedBySlot.over).toBe('cell-80')
})

test('analytics selections, flags, and requests stay scoped to the owner and exact targets', () => {
  const first = createAnalyticsPreviewStore(makeSeed())
  const second = createAnalyticsPreviewStore(makeSeed({ ownerId: 'analytics-owner-b' }))
  const ownerId = first.getState().ownerId

  expect(first.getState().select('other-owner', 'range', '24h')).toBe(false)
  expect(first.getState().setFlag('other-owner', 'totals', false)).toBe(false)
  expect(first.getState().request('other-owner', { actionId: 'inspect' })).toBeUndefined()
  expect(first.getState().select(ownerId, 'range', 'missing')).toBe(false)
  expect(first.getState().setFlag(ownerId, 'missing', true)).toBe(false)
  expect(first.getState().request(ownerId, { actionId: 'open', value: 'worker' })).toBeUndefined()
  expect(first.getState().request(ownerId, { actionId: 'open', value: ' runs' })).toBeUndefined()

  const inspectRequest = first.getState().request(ownerId, { actionId: 'inspect' })
  expect(inspectRequest).toEqual({
    ownerId,
    variant: 1,
    fixtureId: 'analytics-fixture-a',
    actionId: 'inspect',
  })
  expect(first.getState().request(ownerId, { actionId: 'inspect' })).toBeUndefined()
  expect(first.getState().setFlag(ownerId, 'totals', false)).toBe(true)
  expect(first.getState().lastRequest).toBeUndefined()
  expect(first.getState().setFlag(ownerId, 'totals', false)).toBe(true)
  expect(first.getState().request(ownerId, { actionId: 'open', value: 'runs' })).toBeDefined()
  expect(first.getState().select(ownerId, 'range', '30d')).toBe(true)
  expect(first.getState().lastRequest).toBeUndefined()

  expect(second.getState().selectedBySlot.range).toBe('7d')
  expect(second.getState().flagsById.totals).toBe(true)
})

test('analytics refresh preserves live state, prunes stale records, and guards owner identity', () => {
  const store = createAnalyticsPreviewStore(
    makeSeed({
      flags: [
        { id: 'totals', value: false },
        { id: 'removed', value: true },
      ],
      requestActions: [{ actionId: 'open', value: 'runs' }],
    }),
  )
  const ownerId = store.getState().ownerId
  const stale = store.getState()
  expect(store.getState().select(ownerId, 'range', '30d')).toBe(true)
  expect(store.getState().setFlag(ownerId, 'totals', true)).toBe(true)
  expect(store.getState().request(ownerId, { actionId: 'open', value: 'runs' })).toBeDefined()

  expect(
    store.getState().refresh(
      makeSeed({
        slots: [
          { id: 'range', items: [{ id: '30d', disabled: true }, { id: '90d' }], initialId: '30d' },
          { id: 'metric', items: [{ id: 'cost' }] },
          { id: 'cursorpoint', items: [] },
        ],
        flags: [{ id: 'totals', value: false }],
        requestActions: [{ actionId: 'inspect' }],
      }),
    ),
  ).toBe(true)

  const refreshed = store.getState()
  expect(refreshed.selectedBySlot).toEqual({ range: '90d', metric: 'cost', cursorpoint: undefined })
  expect(refreshed.flagsById).toEqual({ totals: true })
  expect(refreshed.lastRequest).toBeUndefined()
  expect(refreshed.request(ownerId, { actionId: 'open', value: 'runs' })).toBeUndefined()
  expect(refreshed.request(ownerId, { actionId: 'inspect' })).toBeDefined()
  expect(stale.select(ownerId, 'range', '30d')).toBe(false)

  expect(store.getState().refresh(makeSeed({ ownerId: 'analytics-owner-b' }))).toBe(false)
  expect(store.getState().refresh(makeSeed({ variant: 9 }))).toBe(false)
  expect(store.getState().refresh(makeSeed({ fixtureId: 'analytics-fixture-b' }))).toBe(false)
})

test('analytics refresh retains exact request intent when selections and target stay live', () => {
  const store = createAnalyticsPreviewStore(makeSeed({ requestActions: [{ actionId: 'inspect' }] }))
  const ownerId = store.getState().ownerId
  expect(store.getState().request(ownerId, { actionId: 'inspect' })).toBeDefined()
  expect(store.getState().refresh(makeSeed({ requestActions: [{ actionId: 'inspect' }] }))).toBe(true)
  expect(store.getState().lastRequest).toEqual({
    ownerId,
    variant: 1,
    fixtureId: 'analytics-fixture-a',
    actionId: 'inspect',
  })
})
