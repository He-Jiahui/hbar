import { expect, test } from 'bun:test'
import { createMobilePreviewStore, type MobilePreviewSeed } from '../apps/hbar-app-ui-preview/src/mobilePreviewModel'

function makeSeed(overrides: Partial<MobilePreviewSeed> = {}): MobilePreviewSeed {
  return {
    ownerId: 'mobile-preview-a',
    variant: 1,
    fixtureId: 'default',
    slots: [
      {
        id: 'tab',
        items: [{ id: 'home' }, { id: 'activity' }, { id: 'settings' }],
        initialSelectedId: 'activity',
      },
    ],
    drafts: [{ id: 'query', value: '' }],
    flags: [{ id: 'show-complete', value: false }],
    tasks: [
      { id: 'task-1', complete: false },
      { id: 'task-2', complete: true },
    ],
    requestActions: [
      { actionId: 'search' },
      { actionId: 'open-task', targetId: 'task-1' },
      { actionId: 'open-task', targetId: 'task-2' },
    ],
    ...overrides,
  }
}

test('mobile normalizes duplicate and blank IDs while preserving exact nonblank IDs', () => {
  const store = createMobilePreviewStore(
    makeSeed({
      slots: [
        {
          id: 'tabs',
          initialSelectedId: 'stale',
          items: [{ id: ' first ' }, { id: ' first ' }, { id: '   ' }, { id: 'second' }],
        },
        { id: 'empty', items: [{ id: '' }, { id: '  ' }] },
        { id: 'tabs', items: [{ id: 'ignored' }] },
        { id: '  ', items: [{ id: 'ignored-blank-slot' }] },
      ],
      drafts: [
        { id: 'draft', value: 'initial' },
        { id: 'draft', value: 'ignored' },
        { id: ' ', value: 'ignored blank' },
      ],
      flags: [
        { id: 'enabled', value: true },
        { id: 'enabled', value: false },
        { id: '', value: true },
      ],
      tasks: [
        { id: 'task', complete: false },
        { id: 'task', complete: true },
        { id: ' ', complete: true },
      ],
      requestActions: [
        { actionId: 'open', targetId: ' target ' },
        { actionId: 'open', targetId: ' target ' },
        { actionId: 'open', targetId: '   ' },
        { actionId: '  ' },
      ],
    }),
  )

  expect(store.getState().slots.map(({ id, items }) => [id, items.map(({ id: itemId }) => itemId)])).toEqual([
    ['tabs', [' first ', 'second']],
    ['empty', []],
  ])
  expect(store.getState().selectedBySlot).toEqual({ tabs: ' first ', empty: undefined })
  expect(store.getState().drafts).toEqual([{ id: 'draft', value: 'initial' }])
  expect(store.getState().flags).toEqual([{ id: 'enabled', value: true }])
  expect(store.getState().tasks).toEqual([{ id: 'task', complete: false }])
  expect(store.getState().requestActions).toEqual([{ actionId: 'open', targetId: ' target ' }])
})

test('mobile mutations are owner guarded and selection, draft, flag, and task changes clear intent', () => {
  const store = createMobilePreviewStore(makeSeed())
  const ownerId = store.getState().ownerId

  expect(store.getState().select('other-owner', 'tab', 'home')).toBe(false)
  expect(store.getState().setDraft('other-owner', 'query', 'ignored')).toBe(false)
  expect(store.getState().setFlag('other-owner', 'show-complete', true)).toBe(false)
  expect(store.getState().setTaskComplete('other-owner', 'task-1', true)).toBe(false)
  expect(store.getState().refresh('other-owner', makeSeed({ variant: 1 }))).toBe(false)

  expect(store.getState().request(ownerId, { actionId: 'search' })).toBeDefined()
  expect(store.getState().select(ownerId, 'tab', 'home')).toBe(true)
  expect(store.getState().lastRequest).toBeUndefined()

  expect(store.getState().request(ownerId, { actionId: 'search' })).toBeDefined()
  expect(store.getState().setDraft(ownerId, 'query', '  exact query  ')).toBe(true)
  expect(store.getState().draftsById.query).toBe('  exact query  ')
  expect(store.getState().lastRequest).toBeUndefined()

  expect(store.getState().request(ownerId, { actionId: 'search' })).toBeDefined()
  expect(store.getState().setFlag(ownerId, 'show-complete', true)).toBe(true)
  expect(store.getState().flagsById['show-complete']).toBe(true)
  expect(store.getState().lastRequest).toBeUndefined()

  expect(store.getState().request(ownerId, { actionId: 'search' })).toBeDefined()
  expect(store.getState().setTaskComplete(ownerId, 'task-1', true)).toBe(true)
  expect(store.getState().taskCompleteById['task-1']).toBe(true)
  expect(store.getState().lastRequest).toBeUndefined()

  expect(store.getState().setDraft(ownerId, 'missing', 'ignored')).toBe(false)
  expect(store.getState().setFlag(ownerId, 'missing', true)).toBe(false)
  expect(store.getState().setTaskComplete(ownerId, 'missing', true)).toBe(false)
})

test('mobile requests require exact allowed pairs, omit absent values, and suppress duplicates', () => {
  const store = createMobilePreviewStore(
    makeSeed({
      requestActions: [
        { actionId: 'search' },
        { actionId: 'open-task', targetId: ' task-1 ' },
        { actionId: 'open-task', targetId: ' task-1 ' },
        { actionId: 'open-task', targetId: '   ' },
        { actionId: '' },
      ],
    }),
  )
  const ownerId = store.getState().ownerId

  const search = store.getState().request(ownerId, { actionId: 'search' })
  expect(search).toEqual({ ownerId, variant: 1, fixtureId: 'default', actionId: 'search' })
  expect(search && 'value' in search).toBe(false)
  expect(store.getState().request(ownerId, { actionId: 'search' })).toBeUndefined()
  expect(store.getState().request(ownerId, { actionId: 'open-task', targetId: 'task-1' })).toBeUndefined()

  const open = store.getState().request(ownerId, { actionId: 'open-task', targetId: ' task-1 ' })
  expect(open).toEqual({ ownerId, variant: 1, fixtureId: 'default', actionId: 'open-task', value: ' task-1 ' })
  expect(store.getState().request(ownerId, { actionId: 'open-task', targetId: ' task-1 ' })).toBeUndefined()
  expect(store.getState().request('other-owner', { actionId: 'open-task', targetId: ' task-1 ' })).toBeUndefined()
  expect(store.getState().request(ownerId, { actionId: 'unknown' })).toBeUndefined()
  expect(store.getState().request(ownerId, { actionId: 'open-task', targetId: ' ' })).toBeUndefined()
})

test('mobile refresh preserves owned values, falls back removed selections, and prunes stale targets and intent', () => {
  const store = createMobilePreviewStore(
    makeSeed({
      variant: 7,
      slots: [
        { id: 'primary', items: [{ id: 'one' }, { id: 'two' }], initialSelectedId: 'one' },
        { id: 'secondary', items: [{ id: 'alpha' }, { id: 'beta' }], initialSelectedId: 'alpha' },
      ],
      drafts: [
        { id: 'query', value: 'initial' },
        { id: 'removed-query', value: 'discarded' },
      ],
      flags: [
        { id: 'pinned', value: false },
        { id: 'removed-flag', value: true },
      ],
      tasks: [
        { id: 'task-1', complete: false },
        { id: 'removed-task', complete: false },
      ],
      requestActions: [
        { actionId: 'open-task', targetId: 'task-1' },
        { actionId: 'open-task', targetId: 'removed-task' },
      ],
    }),
  )
  const ownerId = store.getState().ownerId

  expect(store.getState().select(ownerId, 'secondary', 'beta')).toBe(true)
  expect(store.getState().setDraft(ownerId, 'query', 'kept draft')).toBe(true)
  expect(store.getState().setFlag(ownerId, 'pinned', true)).toBe(true)
  expect(store.getState().setTaskComplete(ownerId, 'task-1', true)).toBe(true)
  expect(store.getState().request(ownerId, { actionId: 'open-task', targetId: 'removed-task' })).toBeDefined()

  expect(store.getState().refresh(ownerId, makeSeed({ variant: 8 }))).toBe(false)
  expect(store.getState().refresh(ownerId, makeSeed({ variant: 7, fixtureId: 'other' }))).toBe(false)
  expect(
    store.getState().refresh(
      ownerId,
      makeSeed({
        variant: 7,
        slots: [
          { id: 'primary', items: [{ id: 'two' }, { id: 'three' }], initialSelectedId: 'three' },
          { id: 'secondary', items: [{ id: 'gamma' }], initialSelectedId: 'gamma' },
        ],
        drafts: [{ id: 'query', value: 'host update' }],
        flags: [{ id: 'pinned', value: false }],
        tasks: [{ id: 'task-1', complete: false }],
        requestActions: [{ actionId: 'open-task', targetId: 'task-1' }],
      }),
    ),
  ).toBe(true)

  const state = store.getState()
  expect(state.selectedBySlot).toEqual({ primary: 'three', secondary: 'gamma' })
  expect(state.draftsById).toEqual({ query: 'kept draft' })
  expect(state.flagsById).toEqual({ pinned: true })
  expect(state.taskCompleteById).toEqual({ 'task-1': true })
  expect(state.lastRequest).toBeUndefined()
  expect(state.request(ownerId, { actionId: 'open-task', targetId: 'removed-task' })).toBeUndefined()
  expect(state.request(ownerId, { actionId: 'open-task', targetId: 'task-1' })).toEqual({
    ownerId,
    variant: 7,
    fixtureId: 'default',
    actionId: 'open-task',
    value: 'task-1',
  })
})
