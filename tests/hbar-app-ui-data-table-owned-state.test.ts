import { expect, test } from 'bun:test'
import { createTablePreviewStore, type TablePreviewSeed } from '../apps/hbar-app-ui-preview/src/dataTablePreviewModel'

function makeSeed(overrides: Partial<TablePreviewSeed> = {}): TablePreviewSeed {
  return {
    ownerId: 'table-owner-a',
    variant: 2,
    fixtureId: 'fixture-a',
    slots: [
      {
        id: 'plan',
        items: [{ id: 'all' }, { id: 'growth' }, { id: 'disabled', disabled: true }],
        initialSelectedId: 'all',
      },
      { id: 'density', items: [{ id: 'compact' }, { id: 'comfortable' }], initialSelectedId: 'comfortable' },
    ],
    rows: [
      {
        id: 'row-a',
        searchText: 'Alpha growth',
        categoryId: 'growth',
        values: { name: 'Alpha', mrr: 40, hours: 4 },
        editable: [{ id: 'hours', value: 4, min: 0, max: 12 }],
      },
      {
        id: 'row-b',
        searchText: 'Beta starter',
        categoryId: 'starter',
        values: { name: 'Beta', mrr: 90, hours: 8 },
        editable: [{ id: 'hours', value: 8, min: 0, max: 12, locked: true }],
      },
      {
        id: 'row-c',
        searchText: 'Gamma growth',
        categoryId: 'growth',
        values: { name: 'Gamma', mrr: 65, hours: 2 },
        editable: [{ id: 'hours', value: 2, min: 0, max: 12 }],
      },
      { id: 'row-disabled', disabled: true, searchText: 'Disabled growth', categoryId: 'growth', values: { mrr: 5 } },
    ],
    flags: [
      { id: 'select:row-a', value: false },
      { id: 'expand:row-a', value: false },
      { id: 'column:mrr', value: true },
    ],
    query: '',
    sort: undefined,
    page: 1,
    pageSize: 2,
    allowedPageSizes: [2, 4],
    totalRows: 4,
    requestActions: [
      { actionId: 'export' },
      { actionId: 'open', targetId: 'row-a' },
      { actionId: 'open', targetId: 'row-a' },
    ],
    ...overrides,
  }
}

test('table owner and ID guards reject stale or disabled callbacks and requests are first-wins', () => {
  const store = createTablePreviewStore(
    makeSeed({
      rows: [
        makeSeed().rows[0]!,
        makeSeed().rows[0]!,
        { id: 'row-disabled', disabled: true, searchText: 'Disabled', values: { mrr: 5 } },
      ],
      flags: [
        { id: 'select:row-a', value: true },
        { id: 'select:row-a', value: false },
        { id: ' ', value: true },
      ],
    }),
  )
  const state = store.getState()

  expect(state.rows.map((row) => row.id)).toEqual(['row-a', 'row-disabled'])
  expect(state.flags).toEqual([{ id: 'select:row-a', value: true }])
  expect(state.selectedBySlot.plan).toBe('all')
  expect(state.select('other-owner', 'plan', 'growth')).toBe(false)
  expect(state.select(state.ownerId, 'plan', 'disabled')).toBe(false)
  expect(state.select(state.ownerId, 'missing', 'growth')).toBe(false)
  expect(state.setFlag(state.ownerId, 'removed', true)).toBe(false)
  expect(state.request('other-owner', { actionId: 'export' })).toBeUndefined()

  const request = state.request(state.ownerId, { actionId: 'open', targetId: 'row-a' })
  expect(request).toMatchObject({ actionId: 'open', targetId: 'row-a' })
  expect(state.request(state.ownerId, { actionId: 'open', targetId: 'row-a' })).toBeUndefined()
  expect(state.request(state.ownerId, { actionId: 'open', targetId: 'row-b' })).toBeUndefined()
  expect(state.request(state.ownerId, { actionId: 'missing' })).toBeUndefined()
})

test('flags remain independent while query, plan category, sort and pagination derive visible IDs', () => {
  const store = createTablePreviewStore(makeSeed())
  const state = store.getState()
  const ownerId = state.ownerId

  expect(state.setFlag(ownerId, 'select:row-a', true)).toBe(true)
  expect(state.setFlag(ownerId, 'expand:row-a', true)).toBe(true)
  expect(store.getState().flagsById).toEqual({ 'select:row-a': true, 'expand:row-a': true, 'column:mrr': true })
  expect(state.setFlag(ownerId, 'column:mrr', false)).toBe(true)
  expect(store.getState().flagsById['select:row-a']).toBe(true)

  expect(state.select(ownerId, 'plan', 'growth')).toBe(true)
  expect(store.getState().filteredRowIds).toEqual(['row-a', 'row-c', 'row-disabled'])
  expect(state.setQuery(ownerId, 'gamma')).toBe(true)
  expect(store.getState().filteredRowIds).toEqual(['row-c'])
  expect(state.setQuery(ownerId, '')).toBe(true)
  expect(state.setSort(ownerId, { field: 'mrr', direction: 'desc' })).toBe(true)
  expect(store.getState().filteredRowIds).toEqual(['row-c', 'row-a', 'row-disabled'])
  expect(state.setPage(ownerId, 2)).toBe(true)
  expect(store.getState().visibleRowIds).toEqual(['row-disabled'])
  expect(state.setSort(ownerId, { field: 'unknown', direction: 'asc' })).toBe(false)
  expect(state.setPage(ownerId, 4)).toBe(false)
})

test('numeric edit drafts are owner-bound, finite, non-negative and range checked', () => {
  const store = createTablePreviewStore(makeSeed())
  const state = store.getState()
  const ownerId = state.ownerId

  expect(state.beginEdit('other-owner', 'row-a', 'hours')).toBe(false)
  expect(state.beginEdit(ownerId, 'row-b', 'hours')).toBe(false)
  expect(state.beginEdit(ownerId, 'row-a', 'missing')).toBe(false)
  expect(state.beginEdit(ownerId, 'row-a', 'hours')).toBe(true)
  expect(state.setEditDraft(ownerId, 'not-a-number')).toBe(true)
  expect(state.commitEdit(ownerId)).toBe(false)
  expect(store.getState().editError).toBe('invalid')
  expect(store.getState().rowsById['row-a']?.values.hours).toBe(4)
  expect(state.setEditDraft(ownerId, '-1')).toBe(true)
  expect(state.commitEdit(ownerId)).toBe(false)
  expect(state.setEditDraft(ownerId, '9')).toBe(true)
  expect(state.commitEdit(ownerId)).toBe(true)
  expect(store.getState().rowsById['row-a']?.values.hours).toBe(9)
  expect(store.getState().editDraft).toBeUndefined()
  expect(state.beginEdit(ownerId, 'row-a', 'hours')).toBe(true)
  expect(state.setEditDraft(ownerId, '10')).toBe(true)
  expect(state.cancelEdit(ownerId)).toBe(true)
  expect(store.getState().rowsById['row-a']?.values.hours).toBe(9)
})

test('refresh preserves valid local state and prunes removed rows, flags, drafts and requests', () => {
  const store = createTablePreviewStore(makeSeed())
  const ownerId = store.getState().ownerId
  expect(store.getState().select(ownerId, 'plan', 'growth')).toBe(true)
  expect(store.getState().setFlag(ownerId, 'select:row-a', true)).toBe(true)
  expect(store.getState().beginEdit(ownerId, 'row-a', 'hours')).toBe(true)
  expect(store.getState().setEditDraft(ownerId, '11')).toBe(true)
  expect(store.getState().commitEdit(ownerId)).toBe(true)
  expect(store.getState().beginEdit(ownerId, 'row-a', 'hours')).toBe(true)
  expect(store.getState().request(ownerId, { actionId: 'open', targetId: 'row-a' })).toBeDefined()

  expect(
    store.getState().refresh(
      ownerId,
      makeSeed({
        rows: [
          {
            ...makeSeed().rows[0]!,
            values: { name: 'Alpha refreshed', mrr: 45, hours: 3 },
            editable: [{ id: 'hours', value: 3, min: 0, max: 12 }],
          },
          { ...makeSeed().rows[2]!, values: { name: 'Gamma refreshed', mrr: 70, hours: 2 } },
        ],
        flags: [{ id: 'select:row-a', value: false }],
        requestActions: [{ actionId: 'export' }],
      }),
    ),
  ).toBe(true)
  const refreshed = store.getState()
  expect(refreshed.selectedBySlot.plan).toBe('growth')
  expect(refreshed.flagsById).toEqual({ 'select:row-a': true })
  expect(refreshed.rowsById['row-a']?.values.hours).toBe(11)
  expect(refreshed.editDraft?.rowId).toBe('row-a')
  expect(refreshed.request(ownerId, { actionId: 'open', targetId: 'row-a' })).toBeUndefined()
  expect(refreshed.request(ownerId, { actionId: 'export' })).toBeDefined()

  expect(store.getState().refresh('other-owner', makeSeed())).toBe(false)
  expect(store.getState().refresh(ownerId, makeSeed({ variant: 8 }))).toBe(false)
})

test('remote totals permit an unobserved second page without inventing row IDs', () => {
  const store = createTablePreviewStore(makeSeed({ totalRows: 28, rows: makeSeed().rows.slice(0, 2) }))
  const ownerId = store.getState().ownerId
  expect(store.getState().setPage(ownerId, 2)).toBe(true)
  expect(store.getState().page).toBe(2)
  expect(store.getState().visibleRowIds).toEqual([])
  expect(store.getState().setPage(ownerId, 14)).toBe(true)
  expect(store.getState().setPage(ownerId, 15)).toBe(false)
})
