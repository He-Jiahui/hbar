import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiIntegrationProvider,
  selectHbarAppUiIntegrationItem,
  uniqueHbarAppUiIntegrationItems,
  type HbarAppUiIntegrationContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiIntegrationsEmptyFixtures,
  createHbarAppUiIntegrationsLocalizedFixtures,
  createHbarAppUiIntegrationsOverflowFixtures,
  HBAR_APP_UI_INTEGRATIONS_FIXTURES,
} from './fixtures/hbar-app-ui-integrations-fixtures'

function renderIntegrations(
  variant: number,
  content: HbarAppUiIntegrationContent = HBAR_APP_UI_INTEGRATIONS_FIXTURES,
): string {
  const component = getHbarAppUiVariant('integrations', variant).component
  return renderToStaticMarkup(
    createElement(HbarAppUiIntegrationProvider, { content, children: createElement(component, {}) }),
  )
}

describe('hbar-app-ui integrations surfaces', () => {
  test('renders six independent host-owned workflows', () => {
    const markup = Array.from({ length: 6 }, (_, index) => renderIntegrations(index + 1))
    expect(new Set(markup).size).toBe(6)
    expect(markup[0]).toContain('hbar-app-ui-integration-marketplace-surface')
    expect(markup[1]).toContain('hbar-app-ui-integration-connection-surface')
    expect(markup[2]).toContain('hbar-app-ui-integration-api-keys-surface')
    expect(markup[3]).toContain('hbar-app-ui-integration-webhooks-surface')
    expect(markup[4]).toContain('hbar-app-ui-integration-consent-surface')
    expect(markup[5]).toContain('hbar-app-ui-integration-sync-surface')
    for (const value of markup) expect(value).toContain('hbar-app-ui-')
  })

  test('keeps localized, long host copy outside the reusable components', () => {
    const localized = createHbarAppUiIntegrationsLocalizedFixtures()
    expect(renderIntegrations(1, localized)).toContain('Integrationen')
    expect(renderIntegrations(1, localized)).toContain('Sehr lange lokalisierte Beschreibung')
    expect(renderIntegrations(3, localized)).toContain('Schlüssel erstellen')
    expect(renderIntegrations(6, localized)).toContain('Alle synchronisieren')
  })

  test('documents and renders pane-owned scroll behavior for over-bound collections', () => {
    const overflow = createHbarAppUiIntegrationsOverflowFixtures()
    expect(renderIntegrations(1, overflow)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(renderIntegrations(3, overflow)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(renderIntegrations(4, overflow)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(renderIntegrations(6, overflow)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(overflow.marketplace?.items.length).toBeGreaterThan(overflow.marketplace?.listStrategy.expectedMaximum ?? 0)
    expect(overflow.apiKeys?.keys.length).toBeGreaterThan(overflow.apiKeys?.listStrategy.expectedMaximum ?? 0)
    expect(overflow.webhooks?.deliveries.length).toBeGreaterThan(
      overflow.webhooks?.deliveryListStrategy.expectedMaximum ?? 0,
    )
    expect(overflow.sync?.sources.length).toBeGreaterThan(overflow.sync?.listStrategy.expectedMaximum ?? 0)
  })

  test('preserves empty lists and safe duplicate or stale active-id fallbacks', () => {
    const empty = createHbarAppUiIntegrationsEmptyFixtures()
    expect(renderIntegrations(1, empty)).toContain(empty.marketplace?.labels.empty ?? '')
    expect(renderIntegrations(2, empty)).toContain(empty.connection?.labels.emptyScopes ?? '')
    expect(renderIntegrations(3, empty)).toContain(empty.apiKeys?.labels.empty ?? '')
    expect(renderIntegrations(4, empty)).toContain(empty.webhooks?.labels.emptyEndpoints ?? '')
    expect(renderIntegrations(6, empty)).toContain(empty.sync?.labels.empty ?? '')
    const duplicate = uniqueHbarAppUiIntegrationItems([
      { id: 'same', value: 'first' },
      { id: 'same', value: 'duplicate' },
      { id: 'other', value: 'second' },
    ])
    expect(duplicate).toEqual([
      { id: 'same', value: 'first' },
      { id: 'other', value: 'second' },
    ])
    expect(selectHbarAppUiIntegrationItem(duplicate, 'stale')).toEqual({ id: 'same', value: 'first' })
    expect(selectHbarAppUiIntegrationItem([], 'stale')).toBeUndefined()
  })

  test('keeps dynamic keys, endpoints, permissions, and sync sources in host data', () => {
    expect(renderIntegrations(2)).toContain('Read repositories')
    expect(renderIntegrations(3)).toContain('Billing worker')
    expect(renderIntegrations(4)).toContain('hooks.northwind.dev/halcyon/usage')
    expect(renderIntegrations(5)).toContain('Northwind wants access to your Halcyon workspace')
    expect(renderIntegrations(6)).toContain('events.usage_rollups')
  })
})
