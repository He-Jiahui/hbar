import { expect, test } from 'bun:test'
import {
  createAppSidebarPreviewStore,
  type AppSidebarPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/appSidebarPreviewStore'

const seed = (overrides: Partial<AppSidebarPreviewSeed> = {}): AppSidebarPreviewSeed => ({
  ownerId: 'variant-3:fixture-a',
  workspaceIds: ['northwind', 'atlas'],
  initialWorkspaceId: 'northwind',
  sectionIds: [],
  initialSectionId: null,
  requestTargets: [
    { actionId: 'workspace', value: 'northwind' },
    { actionId: 'workspace', value: 'atlas' },
    { actionId: 'open', value: 'runbook' },
    { actionId: 'create-workspace', value: undefined },
  ],
  ...overrides,
})

test('seed normalization drops blank and duplicate targets but preserves exact IDs and safe fallback', () => {
  const store = createAppSidebarPreviewStore(
    seed({
      workspaceIds: ['northwind', '  ', ' atlas ', 'northwind'],
      initialWorkspaceId: 'missing',
      sectionIds: ['', ' dual ', ' dual '],
      initialSectionId: '',
      requestTargets: [
        { actionId: 'open', value: 'runbook' },
        { actionId: ' ', value: 'runbook' },
        { actionId: 'open', value: '   ' },
        { actionId: 'open', value: 'runbook' },
        { actionId: 'clear-search', value: undefined },
        { actionId: 'clear-search', value: undefined },
      ],
    }),
  )
  const state = store.getState()
  expect(state.seed.workspaceIds).toEqual(['northwind', ' atlas '])
  expect(state.seed.initialWorkspaceId).toBe('northwind')
  expect(state.seed.sectionIds).toEqual([' dual '])
  expect(state.seed.initialSectionId).toBe(' dual ')
  expect(state.workspaceId).toBe('northwind')
  expect(state.sectionId).toBe(' dual ')
  expect(state.seed.requestTargets).toEqual([
    { actionId: 'open', value: 'runbook' },
    { actionId: 'clear-search', value: undefined },
  ])
  expect(state.selectWorkspace('variant-3:fixture-a', 'atlas')).toBe(false)
  expect(state.selectWorkspace('variant-3:fixture-a', ' atlas ')).toBe(true)
  expect(store.getState().workspaceId).toBe(' atlas ')

  const empty = createAppSidebarPreviewStore(seed({ workspaceIds: [], sectionIds: [] }))
  expect(empty.getState().workspaceId).toBeNull()
  expect(empty.getState().sectionId).toBeNull()

  const ownerless = createAppSidebarPreviewStore(seed({ ownerId: ' ' }))
  expect(ownerless.getState().seed.workspaceIds).toEqual([])
  expect(ownerless.getState().workspaceId).toBeNull()
  expect(ownerless.getState().selectWorkspace(' ', 'northwind')).toBe(false)
})

test('selection actions require their owner and an exact allowed ID', () => {
  const store = createAppSidebarPreviewStore(
    seed({ sectionIds: ['automations', 'projects'], initialSectionId: 'automations' }),
  )
  const state = store.getState()
  expect(state.selectWorkspace('other-owner', 'atlas')).toBe(false)
  expect(state.selectWorkspace('variant-3:fixture-a', 'missing')).toBe(false)
  expect(state.selectWorkspace('variant-3:fixture-a', ' ')).toBe(false)
  expect(state.selectWorkspace('variant-3:fixture-a', 'atlas')).toBe(true)
  expect(state.selectSection('variant-3:fixture-a', 'projects')).toBe(true)
  expect(store.getState().workspaceId).toBe('atlas')
  expect(store.getState().sectionId).toBe('projects')
})

test('request records only an explicitly allowed owner/action/value and fabricates no success', () => {
  const store = createAppSidebarPreviewStore(seed())
  const state = store.getState()
  expect(state.request('other-owner', 'open', 'runbook')).toBe(false)
  expect(state.request('variant-3:fixture-a', 'unknown', 'runbook')).toBe(false)
  expect(state.request('variant-3:fixture-a', 'open', 'missing')).toBe(false)
  expect(state.request('variant-3:fixture-a', 'open', ' ')).toBe(false)
  expect(state.request('variant-3:fixture-a', 'open', ' runbook ')).toBe(false)
  expect(state.request('variant-3:fixture-a', 'create-workspace')).toBe(true)
  expect(state.request('variant-3:fixture-a', 'create-workspace')).toBe(false)
  expect(store.getState().intent).toEqual({
    ownerId: 'variant-3:fixture-a',
    actionId: 'create-workspace',
    value: undefined,
  })
  expect(store.getState().workspaceId).toBe('northwind')

  const exactTarget = createAppSidebarPreviewStore(seed({ requestTargets: [{ actionId: 'open', value: ' runbook ' }] }))
  expect(exactTarget.getState().request('variant-3:fixture-a', 'open', 'runbook')).toBe(false)
  expect(exactTarget.getState().request('variant-3:fixture-a', 'open', ' runbook ')).toBe(true)
  expect(exactTarget.getState().intent?.value).toBe(' runbook ')
})

test('reconcile preserves valid selections and intent, falls back removed selections, and rejects another owner', () => {
  const store = createAppSidebarPreviewStore(
    seed({ sectionIds: ['automations', 'projects'], initialSectionId: 'automations' }),
  )
  store.getState().request('variant-3:fixture-a', 'open', 'runbook')
  store.getState().selectWorkspace('variant-3:fixture-a', 'atlas')
  store.getState().selectSection('variant-3:fixture-a', 'projects')

  store.getState().reconcile(
    seed({
      workspaceIds: ['northwind', 'atlas', 'harbor'],
      initialWorkspaceId: 'northwind',
      sectionIds: ['automations'],
      initialSectionId: null,
    }),
  )
  expect(store.getState().workspaceId).toBe('atlas')
  expect(store.getState().sectionId).toBe('automations')
  expect(store.getState().intent?.value).toBe('runbook')

  const beforeOwnerChange = store.getState()
  store.getState().reconcile(seed({ ownerId: 'variant-4:fixture-b', workspaceIds: ['other'] }))
  expect(store.getState().seed).toBe(beforeOwnerChange.seed)
  expect(store.getState().workspaceId).toBe(beforeOwnerChange.workspaceId)
  expect(store.getState().intent).toBe(beforeOwnerChange.intent)

  store.getState().reconcile(
    seed({
      workspaceIds: ['northwind', 'harbor'],
      initialWorkspaceId: 'harbor',
      sectionIds: ['automations'],
      initialSectionId: null,
      requestTargets: [{ actionId: 'open', value: 'another-item' }],
    }),
  )
  expect(store.getState().workspaceId).toBe('harbor')
  expect(store.getState().sectionId).toBe('automations')
  expect(store.getState().intent).toBeNull()
})
