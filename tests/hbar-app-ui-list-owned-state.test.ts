import { expect, test } from 'bun:test'
import { createListPreviewStore, type ListPreviewSeed } from '../apps/hbar-app-ui-preview/src/listPreviewModel'

function makeSeed(overrides: Partial<ListPreviewSeed> = {}): ListPreviewSeed {
  return {
    ownerId: 'list-owner-a',
    variant: 1,
    fixtureId: 'list-fixture-a',
    slots: [
      {
        id: 'filter',
        initialId: 'all',
        items: [{ id: 'all' }, { id: 'open' }, { id: 'closed', disabled: true }],
      },
      {
        id: 'queue',
        items: [{ id: 'task-a' }, { id: 'task-b' }, { id: 'task-c', disabled: true }],
      },
    ],
    flags: [
      { id: 'compact', value: false },
      { id: 'show-completed', value: true },
    ],
    requestActions: [{ actionId: 'open', value: 'task-a' }, { actionId: 'refresh' }],
    orderIds: ['task-a', 'task-c', 'task-b'],
    query: '',
    ...overrides,
  }
}

test('list seed normalization preserves empty, one, normal, and over-boundary collections', () => {
  const normalItems = Array.from({ length: 80 }, (_, index) => ({ id: `item-${index}` }))
  const overBoundaryItems = Array.from({ length: 81 }, (_, index) => ({ id: `over-${index}` }))
  const store = createListPreviewStore(
    makeSeed({
      slots: [
        { id: 'empty', items: [] },
        { id: 'one', items: [{ id: 'only' }], initialId: 'missing' },
        { id: 'normal', items: normalItems, initialId: 'item-79' },
        { id: 'over', items: overBoundaryItems, initialId: 'over-80' },
      ],
      orderIds: [],
    }),
  )

  const state = store.getState()
  expect(state.selectedBySlot).toEqual({ empty: undefined, one: 'only', normal: 'item-79', over: 'over-80' })
  expect(state.slots.find(({ id }) => id === 'empty')?.items).toHaveLength(0)
  expect(state.slots.find(({ id }) => id === 'one')?.items).toHaveLength(1)
  expect(state.slots.find(({ id }) => id === 'normal')?.items).toHaveLength(80)
  expect(state.slots.find(({ id }) => id === 'over')?.items).toHaveLength(81)
  expect(state.orderIds).toEqual([])
})

test('list normalization is first-wins and order IDs are limited to the queue slot', () => {
  const store = createListPreviewStore(
    makeSeed({
      slots: [
        {
          id: 'queue',
          items: [
            { id: 'task-a', disabled: true },
            { id: 'task-a' },
            { id: 'task-b' },
            { id: ' task-c ' },
            { id: '   ' },
          ],
        },
        { id: 'queue', items: [{ id: 'ignored' }] },
        { id: 'filter', items: [{ id: 'all' }] },
      ],
      flags: [
        { id: 'compact', value: true },
        { id: 'compact', value: false },
        { id: ' ', value: true },
      ],
      requestActions: [
        { actionId: 'refresh' },
        { actionId: 'refresh' },
        { actionId: 'open', value: ' task-a ' },
        { actionId: 'open', value: ' task-a ' },
        { actionId: ' ', value: 'ignored' },
      ],
      orderIds: ['task-b', 'missing', 'task-b', ' task-c ', 'filter'],
    }),
  )

  const state = store.getState()
  expect(state.slots.map(({ id, items }) => [id, items.map(({ id: itemId }) => itemId)])).toEqual([
    ['queue', ['task-a', 'task-b', ' task-c ']],
    ['filter', ['all']],
  ])
  expect(state.selectedBySlot).toEqual({ queue: 'task-b', filter: 'all' })
  expect(state.flags).toEqual([{ id: 'compact', value: true }])
  expect(state.flagsById).toEqual({ compact: true })
  expect(state.requestActions).toEqual([{ actionId: 'refresh' }, { actionId: 'open', value: ' task-a ' }])
  expect(state.orderIds).toEqual(['task-b', ' task-c '])
  expect(state.move(state.ownerId, 'task-a', undefined)).toBe(false)
})

test('list actions stay scoped to two owners and clear intent when local state changes', () => {
  const first = createListPreviewStore(makeSeed())
  const second = createListPreviewStore(makeSeed({ ownerId: 'list-owner-b' }))
  const ownerId = first.getState().ownerId

  expect(first.getState().select('other-owner', 'filter', 'open')).toBe(false)
  expect(first.getState().setFlag('other-owner', 'compact', true)).toBe(false)
  expect(first.getState().setQuery('other-owner', 'ignored')).toBe(false)
  expect(first.getState().move('other-owner', 'task-b', undefined)).toBe(false)
  expect(first.getState().request('other-owner', { actionId: 'refresh' })).toBeUndefined()
  expect(first.getState().select(ownerId, 'queue', 'missing')).toBe(false)
  expect(first.getState().select(ownerId, 'queue', 'task-c')).toBe(false)
  expect(first.getState().setFlag(ownerId, 'missing', true)).toBe(false)

  const refreshRequest = first.getState().request(ownerId, { actionId: 'refresh' })
  expect(refreshRequest).toEqual({ ownerId, variant: 1, fixtureId: 'list-fixture-a', actionId: 'refresh' })
  expect(first.getState().request(ownerId, { actionId: 'refresh' })).toBeUndefined()
  expect(first.getState().setQuery(ownerId, 'payments')).toBe(true)
  expect(first.getState().query).toBe('payments')
  expect(first.getState().lastRequest).toBeUndefined()
  expect(first.getState().setFlag(ownerId, 'compact', true)).toBe(true)
  expect(first.getState().move(ownerId, 'task-b', 'task-a')).toBe(true)
  expect(first.getState().orderIds).toEqual(['task-b', 'task-a', 'task-c'])
  expect(first.getState().lastRequest).toBeUndefined()

  expect(second.getState().query).toBe('')
  expect(second.getState().flagsById.compact).toBe(false)
  expect(second.getState().orderIds).toEqual(['task-a', 'task-c', 'task-b'])
})

test('list move uses exact stable IDs, keeps disabled rows in order, and resets to the seed order', () => {
  const store = createListPreviewStore(makeSeed())
  const ownerId = store.getState().ownerId

  expect(store.getState().move(ownerId, 'task-b', 'task-a')).toBe(true)
  expect(store.getState().orderIds).toEqual(['task-b', 'task-a', 'task-c'])
  expect(store.getState().move(ownerId, 'task-b', 'task-b')).toBe(false)
  expect(store.getState().move(ownerId, 'task-b', 'missing')).toBe(false)
  expect(store.getState().move(ownerId, 'task-c', undefined)).toBe(false)
  expect(store.getState().move(ownerId, 'task-a', 'task-c')).toBe(false)
  expect(store.getState().move(ownerId, 'task-a', undefined)).toBe(true)
  expect(store.getState().orderIds).toEqual(['task-b', 'task-c', 'task-a'])

  expect(store.getState().resetOrder(ownerId)).toBe(true)
  expect(store.getState().orderIds).toEqual(['task-a', 'task-c', 'task-b'])
  expect(store.getState().resetOrder(ownerId)).toBe(true)
  expect(store.getState().resetOrder('other-owner')).toBe(false)
})

test('list refresh preserves eligible local state, appends new order IDs, prunes stale IDs, and guards owner identity', () => {
  const store = createListPreviewStore(makeSeed())
  const ownerId = store.getState().ownerId
  const stale = store.getState()

  expect(store.getState().select(ownerId, 'filter', 'open')).toBe(true)
  expect(store.getState().setFlag(ownerId, 'compact', true)).toBe(true)
  expect(store.getState().setQuery(ownerId, 'kept query')).toBe(true)
  expect(store.getState().move(ownerId, 'task-b', 'task-a')).toBe(true)
  expect(store.getState().request(ownerId, { actionId: 'open', value: 'task-a' })).toBeDefined()

  expect(
    store.getState().refresh(
      makeSeed({
        slots: [
          { id: 'filter', items: [{ id: 'open' }, { id: 'all' }] },
          { id: 'queue', items: [{ id: 'task-a' }, { id: 'task-b' }, { id: 'task-d' }] },
        ],
        flags: [{ id: 'compact', value: false }],
        requestActions: [{ actionId: 'open', value: 'task-a' }],
        orderIds: ['task-a', 'task-d'],
        query: 'host query must not overwrite local query',
      }),
    ),
  ).toBe(true)

  const refreshed = store.getState()
  expect(refreshed.selectedBySlot).toEqual({ filter: 'open', queue: 'task-a' })
  expect(refreshed.flagsById).toEqual({ compact: true })
  expect(refreshed.query).toBe('kept query')
  expect(refreshed.orderIds).toEqual(['task-a', 'task-d'])
  expect(refreshed.lastRequest).toBeUndefined()
  expect(stale.select(ownerId, 'filter', 'closed')).toBe(false)
  expect(stale.select(ownerId, 'filter', 'missing')).toBe(false)

  expect(store.getState().refresh(makeSeed({ ownerId: 'list-owner-b' }))).toBe(false)
  expect(store.getState().refresh(makeSeed({ variant: 9 }))).toBe(false)
  expect(store.getState().refresh(makeSeed({ fixtureId: 'list-fixture-b' }))).toBe(false)
})

test('list refresh retains exact request intent when selections and order remain live', () => {
  const store = createListPreviewStore(makeSeed({ requestActions: [{ actionId: 'refresh' }] }))
  const ownerId = store.getState().ownerId

  expect(store.getState().request(ownerId, { actionId: 'refresh' })).toBeDefined()
  expect(
    store.getState().refresh(
      makeSeed({
        requestActions: [{ actionId: 'refresh' }],
        orderIds: ['task-a', 'task-c', 'task-b'],
      }),
    ),
  ).toBe(true)
  expect(store.getState().lastRequest).toEqual({
    ownerId,
    variant: 1,
    fixtureId: 'list-fixture-a',
    actionId: 'refresh',
  })
})
