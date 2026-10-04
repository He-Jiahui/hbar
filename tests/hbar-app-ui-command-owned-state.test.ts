import { expect, test } from 'bun:test'
import {
  createCommandPreviewStore,
  selectCommandPreviewItems,
  selectCommandPreviewSelection,
  type CommandPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/commandPreviewModel'
import { GROUPED_COMMANDS } from './fixtures/hbar-app-ui-command-fixtures'
import {
  ASSISTANT_FIXTURE,
  INVITE_FIXTURE,
  SEARCH_COMMANDS,
  SEARCH_SCOPES,
} from './fixtures/hbar-app-ui-command-workflow-fixtures'

function makeSeed(overrides: Partial<CommandPreviewSeed> = {}): CommandPreviewSeed {
  return {
    ownerId: 'command-preview-a',
    variant: 1,
    fixtureId: 'default',
    surface: 'catalog',
    pages: [{ id: 'home', items: GROUPED_COMMANDS }],
    initialPageId: 'home',
    scopes: [{ id: 'all' }],
    allScopeId: 'all',
    roles: INVITE_FIXTURE.roles,
    suggestions: ASSISTANT_FIXTURE.suggestions.map((item) => ({ id: item.id, query: item.label })),
    requestActions: ['open', 'navigate', 'switch', 'review', 'confirm', 'ask'],
    initialOpen: true,
    initialQuery: '',
    initialSelectedId: GROUPED_COMMANDS[0]?.id,
    initialScopeId: 'all',
    initialEmail: INVITE_FIXTURE.email,
    initialRoleId: INVITE_FIXTURE.roleId,
    initialStep: 1,
    ...overrides,
  }
}

function makeSearchSeed(overrides: Partial<CommandPreviewSeed> = {}): CommandPreviewSeed {
  return makeSeed({
    variant: 3,
    surface: 'search',
    pages: [{ id: 'search', items: SEARCH_COMMANDS }],
    initialPageId: 'search',
    scopes: SEARCH_SCOPES.map(({ id }) => ({ id, ...(id === 'all' ? {} : { kind: id }) })),
    allScopeId: 'all',
    initialSelectedId: SEARCH_COMMANDS[0]?.id,
    ...overrides,
  })
}

test('catalog selection is filtered, owner-bound, last-record-wins, and drills through host pages', () => {
  const items = [
    { id: 'duplicate', label: 'Original value' },
    { id: 'disabled', label: 'Unavailable value', disabled: true },
    { id: 'duplicate', label: 'Updated value' },
    { id: 'other', label: 'Second value' },
  ]
  const store = createCommandPreviewStore(
    makeSeed({
      pages: [
        { id: 'home', items: [{ id: 'theme', label: 'Change theme' }, ...items] },
        {
          id: 'theme-options',
          parentId: 'home',
          entryItemId: 'theme',
          items: [
            { id: 'system', label: 'System' },
            { id: 'light', label: 'Light' },
          ],
        },
      ],
      initialPageId: 'home',
      initialSelectedId: 'missing',
    }),
  )
  const initial = store.getState()

  expect(selectCommandPreviewItems(initial).map(({ id, label }) => [id, label])).toEqual([
    ['theme', 'Change theme'],
    ['duplicate', 'Updated value'],
    ['disabled', 'Unavailable value'],
    ['other', 'Second value'],
  ])
  expect(initial.selectedId).toBe('theme')
  expect(initial.select('other-owner', 'other')).toBe(false)
  expect(initial.select(initial.ownerId, 'deleted')).toBe(false)
  expect(initial.requestCommand(initial.ownerId, { actionId: 'open', targetId: 'disabled' })).toBeUndefined()
  expect(initial.requestCommand(initial.ownerId, { actionId: 'not-allowed', targetId: 'other' })).toBeUndefined()

  expect(initial.setQuery(initial.ownerId, 'second')).toBe(true)
  expect(selectCommandPreviewItems(store.getState()).map(({ id }) => id)).toEqual(['other'])
  expect(store.getState().selectedId).toBeUndefined()
  expect(initial.enterPage(initial.ownerId, 'theme')).toBe(false)
  expect(store.getState().pageId).toBe('home')

  const current = store.getState()
  expect(current.setQuery(current.ownerId, '')).toBe(true)
  expect(current.enterPage(current.ownerId, 'theme')).toBe(true)
  expect(store.getState().pageId).toBe('theme-options')
  expect(store.getState().query).toBe('')
  expect(store.getState().selectedId).toBe('system')
  expect(selectCommandPreviewItems(store.getState()).map(({ id }) => id)).toEqual(['system', 'light'])
  expect(store.getState().backPage(store.getState().ownerId)).toBe(true)
  expect(store.getState().pageId).toBe('home')
  expect(store.getState().selectedId).toBeUndefined()
  expect(store.getState().backPage(store.getState().ownerId)).toBe(false)
})

test('search scopes and result detail requests stay attached to the current selected record', () => {
  const store = createCommandPreviewStore(makeSearchSeed())
  const state = store.getState()

  expect(selectCommandPreviewItems(state).map(({ id }) => id)).toEqual(SEARCH_COMMANDS.map(({ id }) => id))
  expect(state.setScope(state.ownerId, 'person')).toBe(true)
  expect(selectCommandPreviewItems(store.getState()).map(({ id }) => id)).toEqual(['priya', 'marcus'])
  expect(store.getState().selectedId).toBeUndefined()
  expect(store.getState().setScope(state.ownerId, 'missing-scope')).toBe(false)
  expect(store.getState().select(state.ownerId, 'priya')).toBe(true)

  const request = store.getState().requestCommand(state.ownerId, { actionId: 'open', targetId: 'priya' })
  expect(request).toEqual({
    ownerId: state.ownerId,
    variant: 3,
    fixtureId: 'default',
    actionId: 'open',
    value: 'priya',
  })
  expect(store.getState().requestCommand(state.ownerId, { actionId: 'open', targetId: 'marcus' })).toBeUndefined()
  expect(store.getState().requestCommand(state.ownerId, { actionId: 'open', targetId: 'priya' })).toBeUndefined()

  const stale = store.getState()
  expect(
    stale.refresh(
      stale.ownerId,
      makeSearchSeed({ pages: [{ id: 'search', items: SEARCH_COMMANDS.filter(({ id }) => id !== 'priya') }] }),
    ),
  ).toBe(true)
  const projection = selectCommandPreviewSelection(store.getState())
  expect(projection.item).toBeUndefined()
  expect(projection.selectedId).toBeUndefined()
  expect(projection.selectionLost).toBe(true)
  expect(store.getState().requestCommand(state.ownerId, { actionId: 'open', targetId: 'priya' })).toBeUndefined()
})

test('invite review is request-only, uses exact current drafts, and rejects stale or repeated payloads', () => {
  const store = createCommandPreviewStore(makeSeed({ surface: 'invite', variant: 4 }))
  const ownerId = store.getState().ownerId
  const email = '  person@example.test  '

  expect(store.getState().setEmail(ownerId, email)).toBe(true)
  expect(store.getState().setStep(ownerId, 2)).toBe(true)
  expect(store.getState().setRole(ownerId, 'deleted')).toBe(false)
  expect(store.getState().requestReview(ownerId, { email: 'person@example.test', roleId: 'editor' })).toBeUndefined()

  expect(store.getState().setStep(ownerId, 1)).toBe(true)
  const request = store.getState().requestReview(ownerId, { email, roleId: 'editor' })
  expect(request).toEqual({
    ownerId,
    variant: 4,
    fixtureId: 'default',
    actionId: 'review',
    value: `${email}:editor`,
  })
  expect(store.getState().step).toBe(2)
  expect(store.getState().requestReview(ownerId, { email, roleId: 'editor' })).toBeUndefined()
  expect(store.getState().requestConfirm(ownerId, { email: 'person@example.test', roleId: 'editor' })).toBeUndefined()
  const confirmation = store.getState().requestConfirm(ownerId, { email, roleId: 'editor' })
  expect(confirmation).toEqual({
    ownerId,
    variant: 4,
    fixtureId: 'default',
    actionId: 'confirm',
    value: `${email}:editor`,
  })
  expect(store.getState().requestConfirm(ownerId, { email, roleId: 'editor' })).toBeUndefined()
  expect(store.getState().setStep(ownerId, 1)).toBe(true)
  expect(store.getState().email).toBe(email)
  expect(store.getState().roleId).toBe('editor')

  expect(store.getState().setEmail(ownerId, '   ')).toBe(true)
  expect(store.getState().requestReview(ownerId, { email, roleId: 'editor' })).toBeUndefined()
  expect(store.getState().requestReview(ownerId, { email: '   ', roleId: 'editor' })).toBeUndefined()

  const current = store.getState()
  expect(
    current.refresh(ownerId, makeSeed({ surface: 'invite', variant: 4, roles: [{ id: 'viewer' }, { id: 'admin' }] })),
  ).toBe(true)
  expect(store.getState().roleId).toBeUndefined()
  expect(store.getState().requestReview(ownerId, { email: '   ', roleId: 'editor' })).toBeUndefined()
})

test('assistant asks and suggestions use the latest exact query and suppress duplicate requests', () => {
  const store = createCommandPreviewStore(
    makeSeed({
      surface: 'assistant',
      variant: 5,
      initialQuery: '  answer this  ',
      suggestions: [
        { id: 'usage', query: 'usage by workspace' },
        { id: 'cost', query: 'monthly cost  ' },
      ],
    }),
  )
  const ownerId = store.getState().ownerId

  expect(store.getState().requestAsk(ownerId, 'answer this')).toBeUndefined()
  expect(store.getState().requestAsk(ownerId, '  answer this  ')).toEqual({
    ownerId,
    variant: 5,
    fixtureId: 'default',
    actionId: 'ask',
    value: '  answer this  ',
  })
  expect(store.getState().requestAsk(ownerId, '  answer this  ')).toBeUndefined()
  expect(store.getState().useSuggestion(ownerId, 'missing')).toBe(false)
  expect(store.getState().useSuggestion(ownerId, 'cost')).toBe(true)
  expect(store.getState().query).toBe('monthly cost  ')
  expect(store.getState().requestAsk(ownerId, '  answer this  ')).toBeUndefined()
  expect(store.getState().requestAsk(ownerId, 'monthly cost  ')).toEqual({
    ownerId,
    variant: 5,
    fixtureId: 'default',
    actionId: 'ask',
    value: 'monthly cost  ',
  })
  expect(store.getState().setQuery(ownerId, '  ')).toBe(true)
  expect(store.getState().requestAsk(ownerId, '  ')).toBeUndefined()
})

test('assistant asks yield to live command results after a suggestion is selected', () => {
  const store = createCommandPreviewStore(
    makeSeed({
      surface: 'assistant',
      variant: 5,
      pages: [
        {
          id: 'assistant',
          items: [
            { id: 'billing', label: 'Billing settings' },
            { id: 'invite', label: 'Invite a teammate' },
            { id: 'usage', label: 'Usage report' },
          ],
        },
      ],
      initialPageId: 'assistant',
      initialQuery: 'no commands match',
      initialSelectedId: null,
      suggestions: [
        { id: 'billing', query: 'Billing settings' },
        { id: 'invite', query: 'Invite a teammate' },
        { id: 'usage', query: 'Usage report' },
      ],
    }),
  )
  const ownerId = store.getState().ownerId

  expect(selectCommandPreviewItems(store.getState())).toEqual([])
  expect(store.getState().requestAsk(ownerId, 'no commands match')?.actionId).toBe('ask')
  expect(store.getState().useSuggestion(ownerId, 'usage')).toBe(true)
  expect(selectCommandPreviewItems(store.getState()).map(({ id }) => id)).toEqual(['usage'])
  expect(store.getState().requestAsk(ownerId, 'Usage report')).toBeUndefined()
  expect(store.getState().select(ownerId, 'usage')).toBe(true)
  expect(store.getState().requestCommand(ownerId, { actionId: 'open', targetId: 'usage' })).toMatchObject({
    actionId: 'open',
    value: 'usage',
  })
})

test('page arguments request only exact live values and refresh repairs removed choices', () => {
  const pageId = 'workflow-run'
  const argumentsSeed = [
    {
      id: 'workflow',
      kind: 'choice' as const,
      initialValue: 'staged',
      options: [{ id: 'staged' }, { id: 'rotate' }, { id: 'backup' }],
    },
    { id: 'branch', kind: 'text' as const, initialValue: 'main' },
  ]
  const store = createCommandPreviewStore(
    makeSeed({
      variant: 4,
      pages: [{ id: pageId, items: [], arguments: argumentsSeed }],
      initialPageId: pageId,
      initialSelectedId: null,
      requestActions: ['review', 'confirm'],
    }),
  )
  const ownerId = store.getState().ownerId

  expect(store.getState().argumentsByPage[pageId]).toEqual({ workflow: 'staged', branch: 'main' })
  expect(store.getState().setArgument(ownerId, 'other-page', 'branch', 'release/2.4')).toBe(false)
  expect(store.getState().setArgument(ownerId, pageId, 'unknown-field', 'value')).toBe(false)
  expect(store.getState().setArgument(ownerId, pageId, 'workflow', 'deleted-choice')).toBe(false)
  expect(store.getState().requestArguments(ownerId, pageId, 'review', { workflow: 'staged' })).toBeUndefined()
  expect(store.getState().setArgument(ownerId, pageId, 'workflow', 'rotate')).toBe(true)
  expect(store.getState().setArgument(ownerId, pageId, 'branch', '  ')).toBe(true)
  expect(
    store.getState().requestArguments(ownerId, pageId, 'review', { workflow: 'rotate', branch: '  ' }),
  ).toBeUndefined()
  expect(store.getState().setArgument(ownerId, pageId, 'branch', 'release/2.4')).toBe(true)

  const stalePayload = { workflow: 'staged', branch: 'main' }
  expect(store.getState().requestArguments(ownerId, pageId, 'review', stalePayload)).toBeUndefined()
  const livePayload = { workflow: 'rotate', branch: 'release/2.4' }
  expect(store.getState().requestArguments(ownerId, pageId, 'review', livePayload)).toEqual({
    ownerId,
    variant: 4,
    fixtureId: 'default',
    actionId: 'review',
    value: JSON.stringify({ pageId, arguments: livePayload }),
  })
  expect(store.getState().step).toBe(2)
  expect(store.getState().requestArguments(ownerId, pageId, 'review', livePayload)).toBeUndefined()
  expect(store.getState().requestArguments(ownerId, pageId, 'confirm', stalePayload)).toBeUndefined()
  expect(store.getState().requestArguments(ownerId, pageId, 'confirm', livePayload)?.actionId).toBe('confirm')
  expect(store.getState().setStep(ownerId, 1)).toBe(true)
  expect(store.getState().argumentsByPage[pageId]).toEqual(livePayload)

  const refreshedArguments = [
    {
      id: 'workflow',
      kind: 'choice' as const,
      initialValue: 'staged',
      options: [{ id: 'backup' }],
    },
    ...argumentsSeed.slice(1),
  ]
  expect(
    store.getState().refresh(
      ownerId,
      makeSeed({
        variant: 4,
        pages: [{ id: pageId, items: [], arguments: refreshedArguments }],
        initialPageId: pageId,
        initialSelectedId: null,
        requestActions: ['review', 'confirm'],
      }),
    ),
  ).toBe(true)
  expect(store.getState().argumentsByPage[pageId]).toEqual({ workflow: 'backup', branch: 'release/2.4' })
  expect(store.getState().step).toBe(1)
  expect(
    store.getState().requestArguments(ownerId, pageId, 'confirm', { workflow: 'rotate', branch: 'release/2.4' }),
  ).toBeUndefined()
  expect(
    store.getState().requestArguments(ownerId, pageId, 'confirm', { workflow: 'backup', branch: 'release/2.4' }),
  ).toBeUndefined()
})

test('refresh preserves the active owner, scope and drafts while reconciling removed IDs', () => {
  const store = createCommandPreviewStore(makeSearchSeed({ initialQuery: 'latency' }))
  const ownerId = store.getState().ownerId
  expect(store.getState().setQuery(ownerId, 'checkout')).toBe(true)
  expect(store.getState().setScope(ownerId, 'doc')).toBe(true)
  expect(store.getState().select(ownerId, 'incident')).toBe(true)
  expect(store.getState().setOpen(ownerId, false)).toBe(true)

  expect(store.getState().refresh('different-owner', makeSearchSeed())).toBe(false)
  expect(store.getState().refresh(ownerId, makeSearchSeed({ variant: 2, fixtureId: 'overflow' }))).toBe(false)
  expect(
    store
      .getState()
      .refresh(
        ownerId,
        makeSearchSeed({ pages: [{ id: 'search', items: SEARCH_COMMANDS.filter(({ id }) => id !== 'incident') }] }),
      ),
  ).toBe(true)

  const state = store.getState()
  expect(state.query).toBe('checkout')
  expect(state.scopeId).toBe('doc')
  expect(state.open).toBe(false)
  expect(selectCommandPreviewSelection(state).selectionLost).toBe(true)
  expect(state.select(ownerId, 'incident')).toBe(false)
  expect(state.setQuery('different-owner', '')).toBe(false)

  const otherStore = createCommandPreviewStore(makeSearchSeed({ ownerId: 'command-preview-b' }))
  expect(otherStore.getState().query).toBe('')
  expect(otherStore.getState().select(ownerId, 'launch')).toBe(false)
})
