import { expect, test } from 'bun:test'
import { createNavbarPreviewStore, type NavbarPreviewSeed } from '../apps/hbar-app-ui-preview/src/navbarPreviewModel'

function makeSeed(overrides: Partial<NavbarPreviewSeed> = {}): NavbarPreviewSeed {
  return {
    ownerId: 'navbar-preview-a',
    variant: 1,
    fixtureId: 'default',
    slots: [
      {
        id: 'project-tab',
        items: [{ id: 'discussion' }, { id: 'tasks' }, { id: 'timeline' }],
        initialSelectedId: 'tasks',
      },
    ],
    drafts: [{ id: 'query', value: '' }],
    requestActions: [
      { actionId: 'search' },
      { actionId: 'open', targetId: 'task-1' },
      { actionId: 'open', targetId: 'task-2' },
    ],
    ...overrides,
  }
}

test('navbar selections keep first valid IDs, exact whitespace, and the existing fallback behavior', () => {
  const store = createNavbarPreviewStore(
    makeSeed({
      slots: [
        {
          id: 'project-tab',
          initialSelectedId: 'stale',
          items: [{ id: ' first ' }, { id: ' first ' }, { id: '   ' }, { id: 'second' }],
        },
        { id: 'empty-slot', items: [{ id: '' }, { id: '  ' }] },
        { id: 'project-tab', items: [{ id: 'ignored-duplicate-slot' }] },
        { id: '   ', items: [{ id: 'ignored-blank-slot' }] },
      ],
    }),
  )
  const state = store.getState()

  expect(state.slots.map(({ id, items }) => [id, items.map(({ id: itemId }) => itemId)])).toEqual([
    ['project-tab', [' first ', 'second']],
    ['empty-slot', []],
  ])
  expect(state.selectedBySlot).toEqual({ 'project-tab': ' first ', 'empty-slot': undefined })
  expect(state.select('other-owner', 'project-tab', 'second')).toBe(false)
  expect(state.select(state.ownerId, 'missing-slot', 'second')).toBe(false)
  expect(state.select(state.ownerId, 'project-tab', 'missing-item')).toBe(false)
  expect(state.select(state.ownerId, 'project-tab', '   ')).toBe(false)
  expect(state.select(state.ownerId, 'project-tab', 'second')).toBe(true)
  expect(store.getState().selectedBySlot['project-tab']).toBe('second')
})

test('navbar request intent preserves absent values, validates exact allowed pairs, and suppresses duplicates', () => {
  const store = createNavbarPreviewStore(
    makeSeed({
      requestActions: [
        { actionId: 'search' },
        { actionId: 'open', targetId: ' task-1 ' },
        { actionId: 'open', targetId: ' task-1 ' },
        { actionId: 'open', targetId: '   ' },
        { actionId: '  ' },
      ],
    }),
  )
  const ownerId = store.getState().ownerId

  const search = store.getState().request(ownerId, { actionId: 'search' })
  expect(search).toEqual({ ownerId, variant: 1, fixtureId: 'default', actionId: 'search' })
  expect(search && 'value' in search).toBe(false)
  expect(store.getState().request(ownerId, { actionId: 'search' })).toBeUndefined()
  expect(store.getState().request(ownerId, { actionId: 'open', targetId: 'task-1' })).toBeUndefined()

  const open = store.getState().request(ownerId, { actionId: 'open', targetId: ' task-1 ' })
  expect(open).toEqual({ ownerId, variant: 1, fixtureId: 'default', actionId: 'open', value: ' task-1 ' })
  expect(store.getState().request(ownerId, { actionId: 'open', targetId: ' task-1 ' })).toBeUndefined()
  expect(store.getState().request('other-owner', { actionId: 'open', targetId: ' task-1 ' })).toBeUndefined()
  expect(store.getState().request(ownerId, { actionId: 'unknown' })).toBeUndefined()
  expect(store.getState().request(ownerId, { actionId: 'open', targetId: ' ' })).toBeUndefined()

  expect(store.getState().select(ownerId, 'project-tab', 'timeline')).toBe(true)
  expect(store.getState().lastRequest).toBeUndefined()
})

test('navbar query drafts and optional flags are owner-bound, exact, and invalidate stale intent', () => {
  const store = createNavbarPreviewStore(
    makeSeed({
      drafts: [{ id: 'activity-query', value: 'initial' }],
      flags: [{ id: 'starred', value: false }],
    }),
  )
  const ownerId = store.getState().ownerId

  expect(store.getState().setDraft('other-owner', 'activity-query', 'ignored')).toBe(false)
  expect(store.getState().setDraft(ownerId, 'missing-draft', 'ignored')).toBe(false)
  expect(store.getState().setDraft(ownerId, 'activity-query', '  exact query  ')).toBe(true)
  expect(store.getState().draftsById['activity-query']).toBe('  exact query  ')
  expect(store.getState().request(ownerId, { actionId: 'search' })).toBeDefined()
  expect(store.getState().setDraft(ownerId, 'activity-query', '  exact query  ')).toBe(true)
  expect(store.getState().lastRequest?.actionId).toBe('search')
  expect(store.getState().setDraft(ownerId, 'activity-query', 'changed')).toBe(true)
  expect(store.getState().lastRequest).toBeUndefined()

  expect(store.getState().setFlag(ownerId, 'missing-flag', true)).toBe(false)
  expect(store.getState().setFlag(ownerId, 'starred', true)).toBe(true)
  expect(store.getState().flagsById.starred).toBe(true)
  expect(store.getState().setFlag(ownerId, 'starred', false)).toBe(true)
  expect(store.getState().flagsById.starred).toBe(false)
})

test('refresh preserves owned drafts and valid selections while pruning removed secondary choices and requests', () => {
  const store = createNavbarPreviewStore(
    makeSeed({
      variant: 7,
      slots: [
        { id: 'primary', items: [{ id: 'Revenue' }, { id: 'Customers' }], initialSelectedId: 'Revenue' },
        { id: 'secondary', items: [{ id: 'mrr' }, { id: 'expansion' }, { id: 'churn' }], initialSelectedId: 'mrr' },
      ],
      drafts: [
        { id: 'query', value: 'initial' },
        { id: 'removed-query', value: 'discarded' },
      ],
      requestActions: [
        { actionId: 'primary-tab', targetId: 'Revenue' },
        { actionId: 'secondary-tab', targetId: 'mrr' },
        { actionId: 'secondary-tab', targetId: 'expansion' },
      ],
    }),
  )
  const ownerId = store.getState().ownerId

  expect(store.getState().select(ownerId, 'secondary', 'expansion')).toBe(true)
  expect(store.getState().setDraft(ownerId, 'query', 'kept draft')).toBe(true)
  expect(store.getState().request(ownerId, { actionId: 'secondary-tab', targetId: 'expansion' })).toBeDefined()

  expect(store.getState().refresh('other-owner', makeSeed({ variant: 7 }))).toBe(false)
  expect(store.getState().refresh(ownerId, makeSeed({ variant: 8 }))).toBe(false)
  expect(store.getState().refresh(ownerId, makeSeed({ variant: 7, fixtureId: 'other-fixture' }))).toBe(false)
  expect(
    store.getState().refresh(
      ownerId,
      makeSeed({
        variant: 7,
        slots: [
          { id: 'primary', items: [{ id: 'Revenue' }, { id: 'Customers' }], initialSelectedId: 'Customers' },
          {
            id: 'secondary',
            items: [{ id: 'accounts' }, { id: 'segments' }, { id: 'health' }],
            initialSelectedId: 'accounts',
          },
        ],
        drafts: [{ id: 'query', value: 'new host value' }],
        requestActions: [
          { actionId: 'primary-tab', targetId: 'Revenue' },
          { actionId: 'secondary-tab', targetId: 'accounts' },
          { actionId: 'secondary-tab', targetId: 'segments' },
        ],
      }),
    ),
  ).toBe(true)

  const state = store.getState()
  expect(state.selectedBySlot).toEqual({ primary: 'Revenue', secondary: 'accounts' })
  expect(state.draftsById).toEqual({ query: 'kept draft' })
  expect(state.lastRequest).toBeUndefined()
  expect(state.request(ownerId, { actionId: 'secondary-tab', targetId: 'expansion' })).toBeUndefined()
  expect(state.request(ownerId, { actionId: 'secondary-tab', targetId: 'segments' })).toMatchObject({
    value: 'segments',
  })
})
