import { expect, test } from 'bun:test'
import {
  createFilteringPreviewStore,
  type FilteringPreviewField,
  type FilteringPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/filteringPreviewModel'

function makeSeed(overrides: Partial<FilteringPreviewSeed> = {}): FilteringPreviewSeed {
  return {
    ownerId: 'filtering-owner-a',
    variant: 1,
    fixtureId: 'filtering-fixture-a',
    fields: [
      {
        id: 'status',
        kind: 'single',
        choices: [{ id: 'open' }, { id: 'closed' }],
        initialValue: 'open',
      },
      {
        id: 'labels',
        kind: 'multi',
        choices: [{ id: 'urgent' }, { id: 'review' }, { id: 'blocked', disabled: true }],
        initialValue: ['urgent'],
        maximumSelections: 2,
      },
      { id: 'query', kind: 'text', initialValue: '', maximumLength: 20 },
      { id: 'score', kind: 'number', initialValue: 4, minimum: 0, maximum: 10 },
      { id: 'archived', kind: 'boolean', initialValue: false },
    ],
    requestActions: [{ actionId: 'apply' }, { actionId: 'open', value: 'results' }],
    ...overrides,
  }
}

function field(storeFields: readonly FilteringPreviewField[], id: string): FilteringPreviewField {
  const value = storeFields.find((candidate) => candidate.id === id)
  if (value === undefined) throw new Error(`missing field ${id}`)
  return value
}

test('normalizes empty, one-item, boundary, and over-capacity field inputs deterministically', () => {
  const store = createFilteringPreviewStore(
    makeSeed({
      fields: [
        {
          id: 'single-empty',
          kind: 'single',
          choices: [{ id: 'blocked', disabled: true }],
          initialValue: 'missing',
        },
        {
          id: 'single-one',
          kind: 'single',
          choices: [{ id: 'only' }],
          initialValue: 'missing',
        },
        {
          id: 'multi',
          kind: 'multi',
          choices: [{ id: 'a' }, { id: 'b' }, { id: 'disabled', disabled: true }],
          initialValue: ['a', 'a', 'disabled', 'stale', 'b'],
          maximumSelections: 2,
          allowCustom: false,
        },
        { id: 'duplicate', kind: 'text', initialValue: 'first' },
        { id: 'duplicate', kind: 'text', initialValue: 'second' },
        { id: ' ', kind: 'text', initialValue: 'removed' },
      ],
    }),
  )

  const state = store.getState()
  expect(state.fields.map(({ id }) => id)).toEqual(['single-empty', 'single-one', 'multi', 'duplicate'])
  expect(field(state.fields, 'single-empty')).toMatchObject({ initialValue: '' })
  expect(field(state.fields, 'single-one')).toMatchObject({ initialValue: 'only' })
  expect(field(state.fields, 'multi')).toMatchObject({ initialValue: ['a', 'b'] })
  expect(state.valuesById).toEqual({ 'single-empty': '', 'single-one': 'only', multi: ['a', 'b'], duplicate: 'first' })
})

test('guards values by field kind, disabled choices, finite numeric bounds, and selection limits', () => {
  const store = createFilteringPreviewStore(makeSeed())
  const ownerId = store.getState().ownerId
  const state = store.getState()

  expect(state.setValue(ownerId, 'status', 'closed')).toBe(true)
  expect(state.setValue(ownerId, 'status', 'unknown')).toBe(false)
  expect(state.setValue(ownerId, 'status', 4)).toBe(false)
  expect(state.setValue(ownerId, 'labels', ['urgent', 'review'])).toBe(true)
  expect(state.setValue(ownerId, 'labels', ['urgent', 'review', 'extra'])).toBe(false)
  expect(state.setValue(ownerId, 'labels', ['blocked'])).toBe(false)
  expect(store.getState().valuesById.labels).toEqual(['urgent', 'review'])
  expect(state.setValue(ownerId, 'query', 'x'.repeat(21))).toBe(false)
  expect(state.setValue(ownerId, 'score', Number.NaN)).toBe(false)
  expect(state.setValue(ownerId, 'score', 11)).toBe(false)
  expect(state.setValue(ownerId, 'score', 10)).toBe(true)
  expect(state.setValue(ownerId, 'archived', 'true')).toBe(false)

  const disabled = createFilteringPreviewStore(
    makeSeed({
      fields: [{ id: 'locked', kind: 'single', choices: [{ id: 'only' }], initialValue: 'only', disabled: true }],
    }),
  )
  expect(disabled.getState().setValue(disabled.getState().ownerId, 'locked', 'only')).toBe(false)
})

test('keeps draft, applied, reset, and owner state isolated', () => {
  const first = createFilteringPreviewStore(makeSeed())
  const second = createFilteringPreviewStore(makeSeed({ ownerId: 'filtering-owner-b' }))
  const ownerId = first.getState().ownerId

  expect(first.getState().setValue('other-owner', 'query', 'ignored')).toBe(false)
  expect(first.getState().setValue(ownerId, 'query', 'draft')).toBe(true)
  expect(first.getState().valuesById.query).toBe('draft')
  expect(first.getState().appliedById.query).toBe('')
  expect(first.getState().apply(ownerId)).toBe(true)
  expect(first.getState().appliedById.query).toBe('draft')
  expect(first.getState().setValue(ownerId, 'query', 'changed')).toBe(true)
  expect(first.getState().reset(ownerId, ['query'])).toBe(true)
  expect(first.getState().valuesById.query).toBe('')
  expect(first.getState().appliedById.query).toBe('draft')
  expect(first.getState().reset(ownerId, ['missing'])).toBe(false)
  expect(second.getState().valuesById.query).toBe('')
})

test('refresh preserves eligible draft and applied values, prunes stale values, and guards identity', () => {
  const store = createFilteringPreviewStore(makeSeed())
  const ownerId = store.getState().ownerId
  expect(store.getState().setValue(ownerId, 'query', 'draft')).toBe(true)
  expect(store.getState().setValue(ownerId, 'status', 'closed')).toBe(true)
  expect(store.getState().apply(ownerId)).toBe(true)
  expect(store.getState().setValue(ownerId, 'labels', ['urgent', 'review'])).toBe(true)

  expect(
    store.getState().refresh(
      makeSeed({
        fields: [
          {
            id: 'status',
            kind: 'single',
            choices: [{ id: 'closed', disabled: true }, { id: 'new' }],
            initialValue: 'new',
          },
          { id: 'labels', kind: 'multi', choices: [{ id: 'urgent' }], initialValue: ['urgent'], maximumSelections: 1 },
          { id: 'query', kind: 'text', initialValue: 'new default', maximumLength: 20 },
          { id: 'new-field', kind: 'boolean', initialValue: true },
        ],
        requestActions: [{ actionId: 'apply' }],
      }),
    ),
  ).toBe(true)

  const refreshed = store.getState()
  expect(refreshed.valuesById).toEqual({ status: 'new', labels: ['urgent'], query: 'draft', 'new-field': true })
  expect(refreshed.appliedById).toEqual({ status: 'new', labels: ['urgent'], query: 'draft', 'new-field': true })
  expect(store.getState().refresh(makeSeed({ ownerId: 'filtering-owner-b' }))).toBe(false)
  expect(store.getState().refresh(makeSeed({ variant: 9 }))).toBe(false)
  expect(store.getState().refresh(makeSeed({ fixtureId: 'filtering-fixture-b' }))).toBe(false)
})

test('request accepts exact allowlisted pairs once and clears intent after changes', () => {
  const store = createFilteringPreviewStore(
    makeSeed({
      requestActions: [
        { actionId: 'apply' },
        { actionId: 'apply' },
        { actionId: 'open', value: 'results' },
        { actionId: 'open', value: 'results' },
        { actionId: 'open', value: ' ' },
        { actionId: ' ', value: 'ignored' },
      ],
    }),
  )
  const ownerId = store.getState().ownerId
  expect(store.getState().requestActions).toEqual([{ actionId: 'apply' }, { actionId: 'open', value: 'results' }])
  expect(store.getState().request('other-owner', { actionId: 'apply' })).toBeUndefined()
  expect(store.getState().request(ownerId, { actionId: 'open', value: 'missing' })).toBeUndefined()
  expect(store.getState().request(ownerId, { actionId: 'open', value: ' results' })).toBeUndefined()
  expect(store.getState().request(ownerId, { actionId: 'apply' })).toEqual({
    ownerId,
    variant: 1,
    fixtureId: 'filtering-fixture-a',
    actionId: 'apply',
  })
  expect(store.getState().request(ownerId, { actionId: 'apply' })).toBeUndefined()
  expect(store.getState().setValue(ownerId, 'query', 'changed')).toBe(true)
  expect(store.getState().lastRequest).toBeUndefined()
  expect(store.getState().request(ownerId, { actionId: 'open', value: 'results' })).toBeDefined()
  expect(store.getState().refresh(makeSeed({ requestActions: [{ actionId: 'apply' }] }))).toBe(true)
  expect(store.getState().lastRequest).toBeUndefined()
})

test('unchanged refresh retains a still-allowlisted request while changed refresh clears it', () => {
  const store = createFilteringPreviewStore(makeSeed({ requestActions: [{ actionId: 'apply' }] }))
  const ownerId = store.getState().ownerId
  expect(store.getState().request(ownerId, { actionId: 'apply' })).toBeDefined()
  expect(store.getState().refresh(makeSeed({ requestActions: [{ actionId: 'apply' }] }))).toBe(true)
  expect(store.getState().lastRequest).toEqual({
    ownerId,
    variant: 1,
    fixtureId: 'filtering-fixture-a',
    actionId: 'apply',
  })
  expect(
    store
      .getState()
      .refresh(makeSeed({ fields: [...makeSeed().fields, { id: 'added', kind: 'text', initialValue: '' }] })),
  ).toBe(true)
  expect(store.getState().lastRequest).toBeUndefined()
})
