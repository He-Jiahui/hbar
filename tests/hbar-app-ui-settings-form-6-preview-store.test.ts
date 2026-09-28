import { describe, expect, test } from 'bun:test'
import { createSettingsForm6PreviewFixture } from '../apps/hbar-app-ui-preview/src/settingsForm6PreviewFixtures'
import {
  createSettingsForm6PreviewStore,
  type SettingsForm6PreviewAction,
} from '../apps/hbar-app-ui-preview/src/settingsForm6PreviewStore'

describe('Settings Form 6 safe preview contract', () => {
  test('starts with the captured workspace facts and three consequence items', () => {
    const fixture = createSettingsForm6PreviewFixture()
    const store = createSettingsForm6PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())

    expect(content.workspace).toEqual({
      id: 'northwind',
      name: 'northwind',
      memberCount: 24,
      projectCount: 1284,
      subdomain: 'northwind.app',
    })
    expect(content.impacts).toEqual([
      '1,284 projects and their history',
      'All API keys and connected integrations',
      'The northwind.app subdomain, released for reuse',
    ])
    expect(content.copy.deleteImpactHeadingFor(24)).toBe('Deleting removes, for all 24 members:')
    expect(content.listStrategy.kind).toBe('content-grown')
    expect(content.listStrategy.sourceScrollOwner).toBe('unverified')
  })

  test('stores the confirmation draft without imposing an inferred confirmation rule', () => {
    const fixture = createSettingsForm6PreviewFixture()
    const received: SettingsForm6PreviewAction[] = []
    const store = createSettingsForm6PreviewStore(fixture.storeSeed, (action) => received.push(action))

    expect(store.getState().confirmationValue).toBe('')
    store.getState().setConfirmationValue('not-northwind')
    expect(store.getState().confirmationValue).toBe('not-northwind')
    expect(store.getState().requestAction({ type: 'delete', workspaceId: 'northwind', confirmation: '' })).toBe(true)
    expect(received).toEqual([{ type: 'delete', workspaceId: 'northwind', confirmation: '' }])
    expect(store.getState().confirmationValue).toBe('not-northwind')
    expect(fixture.workspace.id).toBe('northwind')
  })

  test('forwards danger-action intents without changing workspace state or claiming completion', () => {
    const fixture = createSettingsForm6PreviewFixture()
    const received: SettingsForm6PreviewAction[] = []
    const store = createSettingsForm6PreviewStore(fixture.storeSeed, (action) => received.push(action))

    expect(store.getState().requestAction({ type: 'transfer', workspaceId: 'northwind' })).toBe(true)
    expect(store.getState().requestAction({ type: 'archive', workspaceId: 'northwind' })).toBe(true)
    expect(store.getState().requestAction({ type: 'cancel', workspaceId: 'northwind' })).toBe(true)
    expect(
      store.getState().requestAction({ type: 'delete', workspaceId: 'northwind', confirmation: 'northwind' }),
    ).toBe(true)
    expect(received).toEqual([
      { type: 'transfer', workspaceId: 'northwind' },
      { type: 'archive', workspaceId: 'northwind' },
      { type: 'cancel', workspaceId: 'northwind' },
      { type: 'delete', workspaceId: 'northwind', confirmation: 'northwind' },
    ])
    expect(store.getState().confirmationValue).toBe('')
    expect(fixture.workspace.name).toBe('northwind')
  })

  test('does not invoke an action when no host callback is supplied or target is stale', () => {
    const fixture = createSettingsForm6PreviewFixture()
    const store = createSettingsForm6PreviewStore(fixture.storeSeed)

    expect(store.getState().requestAction({ type: 'transfer', workspaceId: 'northwind' })).toBe(false)
    const withHost = createSettingsForm6PreviewStore(fixture.storeSeed, () => undefined)
    expect(withHost.getState().requestAction({ type: 'archive', workspaceId: 'other' })).toBe(false)
    expect(fixture.workspace.id).toBe('northwind')
  })

  test('supports empty, one, normal, and longer localized consequence lists in normal flow', () => {
    const empty = createSettingsForm6PreviewFixture({ impacts: [] })
    const one = createSettingsForm6PreviewFixture({ impacts: ['One consequence'] })
    const normal = createSettingsForm6PreviewFixture()
    const longer = createSettingsForm6PreviewFixture({
      locale: 'de',
      impacts: [
        'Folge eins',
        'Folge zwei',
        'Folge drei',
        'Eine zusätzliche, bewusst längere Folge für schmale Ansichten',
      ],
    })

    expect(empty.impacts).toEqual([])
    expect(one.impacts).toEqual(['One consequence'])
    expect(normal.impacts).toHaveLength(3)
    expect(longer.impacts).toHaveLength(4)
    expect(longer.copy.pageTitle).toBe('Gefahrenbereich')
    expect(longer.copy.confirmationPromptFor('northwind')).toContain('zur Bestätigung')
    expect(longer.contentFor(createSettingsForm6PreviewStore(longer.storeSeed).getState()).listStrategy.note).toContain(
      'normal document flow',
    )
  })

  test('rejects an empty workspace identity rather than accepting an unbound action target', () => {
    expect(() => createSettingsForm6PreviewStore({ workspaceId: ' ' })).toThrow('Workspace IDs must not be empty.')
  })
})
