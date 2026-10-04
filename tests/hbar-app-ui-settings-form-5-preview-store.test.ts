import { describe, expect, test } from 'bun:test'
import { createSettingsForm5PreviewFixture } from '../apps/hbar-app-ui-preview/src/settingsForm5PreviewFixtures'
import { createSettingsForm5PreviewStore } from '../apps/hbar-app-ui-preview/src/settingsForm5PreviewStore'

function itemAt<Item>(items: readonly Item[], index: number): Item {
  const item = items[index]
  if (item === undefined) throw new RangeError(`Missing test item at index ${index}.`)
  return item
}

describe('Settings Form 5 preview contract', () => {
  test('keeps API-key data masked and the reveal state explicitly redacted', () => {
    const fixture = createSettingsForm5PreviewFixture()
    const store = createSettingsForm5PreviewStore(fixture.storeSeed)
    const before = fixture.contentFor(store.getState())

    expect(before.keys.map((key) => key.name)).toEqual(['Production server', 'Staging', 'Data warehouse sync'])
    expect(before.keys.every((key) => key.displayValue === key.maskedDisplay)).toBe(true)
    expect(JSON.stringify(fixture.storeSeed)).not.toMatch(/secretValue|tokenValue|apiKeyValue/i)

    expect(store.getState().toggleKeyReveal('production')).toBe(true)
    const revealed = itemAt(fixture.contentFor(store.getState()).keys, 0)
    expect(revealed.revealed).toBe(true)
    expect(revealed.displayValue).toBe(fixture.copy.revealSafePlaceholder)
    expect(revealed.displayValue).not.toContain('sk_live_')
    expect(store.getState().toggleKeyReveal('production')).toBe(true)
    expect(itemAt(fixture.contentFor(store.getState()).keys, 0).displayValue).toBe(itemAt(before.keys, 0).maskedDisplay)
    expect(store.getState().toggleKeyReveal('missing')).toBe(false)
  })

  test('toggles key action menus without simulating remote rotate or revoke effects', () => {
    const fixture = createSettingsForm5PreviewFixture()
    const store = createSettingsForm5PreviewStore(fixture.storeSeed)

    expect(store.getState().toggleKeyActions('staging')).toBe(true)
    expect(itemAt(fixture.contentFor(store.getState()).keys, 1).actionMenuOpen).toBe(true)
    expect(fixture.copy.rotateKey).toBe('Rotate key')
    expect(fixture.copy.revokeKey).toBe('Revoke key')
    expect(store.getState().keys.map((key) => key.id)).toEqual(['production', 'staging', 'warehouse'])
    expect(store.getState().closeKeyActions()).toBe(true)
    expect(store.getState().closeKeyActions()).toBe(false)
  })

  test('updates integration checked and connected presentation from host state', () => {
    const fixture = createSettingsForm5PreviewFixture()
    const store = createSettingsForm5PreviewStore(fixture.storeSeed)
    const initial = fixture.contentFor(store.getState())

    expect(initial.integrations.map((item) => item.enabled)).toEqual([true, false, true])
    expect(initial.integrations.map((item) => item.connectedLabel)).toEqual(['Connected', undefined, 'Connected'])
    expect(store.getState().setIntegrationEnabled('slack', false)).toBe(true)
    const disabled = itemAt(fixture.contentFor(store.getState()).integrations, 0)
    expect(disabled.enabled).toBe(false)
    expect(disabled.connectedLabel).toBeUndefined()
    expect(store.getState().setIntegrationEnabled('slack', false)).toBe(false)
    expect(store.getState().setIntegrationEnabled('slack', true)).toBe(true)
    expect(store.getState().setIntegrationEnabled('missing', true)).toBe(false)
  })

  test('provides translated accessible actions and content-grown data', () => {
    const german = createSettingsForm5PreviewFixture('de')
    const store = createSettingsForm5PreviewStore(german.storeSeed)
    const content = german.contentFor(store.getState())

    expect(content.copy.pageTitle).toBe('API-Schlüssel')
    const firstKey = itemAt(content.keys, 0)
    expect(firstKey.actionsAccessibleName).toContain('Production server')
    expect(firstKey.revealAccessibleName).toBe('Production server anzeigen')
    expect(content.listStrategy.kind).toBe('content-grown')
    expect(content.listStrategy.note).toContain('normal document flow')
  })

  test('rejects duplicate keys and integrations rather than creating ambiguous action targets', () => {
    const fixture = createSettingsForm5PreviewFixture()

    const firstKey = itemAt(fixture.storeSeed.keys, 0)
    const firstIntegration = itemAt(fixture.storeSeed.integrations, 0)
    expect(() =>
      createSettingsForm5PreviewStore({
        keys: [firstKey, firstKey],
        integrations: fixture.storeSeed.integrations,
      }),
    ).toThrow('API key IDs must be unique.')
    expect(() =>
      createSettingsForm5PreviewStore({
        keys: fixture.storeSeed.keys,
        integrations: [firstIntegration, firstIntegration],
      }),
    ).toThrow('Integration IDs must be unique.')
  })
})
