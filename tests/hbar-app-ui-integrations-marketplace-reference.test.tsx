import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HbarAppUiIntegrationContent } from '../packages/hbar-app-ui/src/index'
import { ReferenceMarketplaceIntegration } from '../hbar-ui/packages/lumen-app-ui/src/integrations/ReferenceMarketplaceIntegration'
import { createIntegrationMarketplaceReferenceFixture } from './fixtures/hbar-app-ui-integrations-marketplace-reference-fixtures'

type MarketplaceContent = NonNullable<HbarAppUiIntegrationContent['marketplace']>

function render(content: MarketplaceContent): string {
  return renderToStaticMarkup(
    createElement(ReferenceMarketplaceIntegration, {
      spec: { id: 'hbar-app-ui-integrations-1', variant: 1, profile: {} },
      content,
      layout: content.referenceLayout ?? { ownerId: 'integrations-marketplace' },
    }),
  )
}

function item(id: string): MarketplaceContent['items'][number] {
  return {
    id,
    initials: 'OV',
    name: `Integration ${id}`,
    categoryId: 'developer',
    categoryLabel: 'Developer',
    description: `Host-provided integration ${id}.`,
    connected: false,
  }
}

describe('integrations marketplace reference view', () => {
  test('renders all six native category tabs and the nine source cards', () => {
    const content = createIntegrationMarketplaceReferenceFixture()
    const markup = render(content)
    const openAction = markup.match(
      /<button[^>]*data-hbar-app-ui-action="integration-marketplace:open-integration"[^>]*>/,
    )?.[0]
    const connectAction = markup.match(
      /<button[^>]*data-hbar-app-ui-action="integration-marketplace:connect-integration"[^>]*>/,
    )?.[0]

    expect(markup).toContain('Integrations')
    expect(markup).toContain('2 connected · 9 available')
    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('role="tabpanel"')
    expect((markup.match(/role="tab"/g) ?? []).length).toBe(6)
    expect((markup.match(/<article[^>]*data-hbar-app-ui-item-id=/g) ?? []).length).toBe(9)
    expect(markup).toContain('data-hbar-app-ui-region="integration-marketplace-items"')
    expect(markup).toContain('data-hbar-app-ui-action="integration-marketplace:search"')
    expect(markup).toContain('Stream product events into Northwind dashboards.')
    expect(markup).toContain('Send sign-in anomalies to your SIEM.')
    expect(openAction).toBeDefined()
    expect(connectAction).toBeDefined()
    expect(openAction).not.toContain('disabled')
    expect(connectAction).not.toContain('disabled')
  })

  test('projects host query and category state, and preserves first records for duplicate ids', () => {
    const content = createIntegrationMarketplaceReferenceFixture()
    const first = content.items.find((candidate) => candidate.id === 'cedar')
    if (!first) throw new Error('The marketplace fixture needs its Cedar Labs card.')
    const markup = render({
      ...content,
      items: [...content.items, { ...first, name: 'Duplicate Cedar integration' }],
      referenceFlow: {
        query: 'cedar',
        categoryId: 'developer',
        onQueryChange: () => {},
        onCategoryChange: () => {},
      },
    })

    expect(markup).toContain('value="cedar"')
    expect(markup).toContain('aria-selected="true"')
    expect(markup).toContain('Cedar Labs')
    expect(markup).not.toContain('Duplicate Cedar integration')
    expect((markup.match(/<article[^>]*data-hbar-app-ui-item-id=/g) ?? []).length).toBe(1)
  })

  test('falls back from stale category ids and renders empty, one, boundary and over-bound lists', () => {
    const content = createIntegrationMarketplaceReferenceFixture()
    const staleCategoryMarkup = render({
      ...content,
      referenceFlow: {
        query: '',
        categoryId: 'removed-category',
        onQueryChange: () => {},
        onCategoryChange: () => {},
      },
    })
    const emptyMarkup = render({ ...content, items: [] })
    const oneMarkup = render({ ...content, items: content.items.slice(0, 1) })
    const boundaryItems = Array.from({ length: content.listStrategy.expectedMaximum }, (_, index) =>
      item(`boundary-${index}`),
    )
    const overflowItems = [...boundaryItems, item('over-bound')]

    expect((staleCategoryMarkup.match(/<article[^>]*data-hbar-app-ui-item-id=/g) ?? []).length).toBe(9)
    expect(emptyMarkup).toContain(content.labels.empty)
    expect(oneMarkup).toContain('data-hbar-app-ui-item-id="northwind"')
    expect(
      (render({ ...content, items: boundaryItems }).match(/<article[^>]*data-hbar-app-ui-item-id=/g) ?? []).length,
    ).toBe(content.listStrategy.expectedMaximum)
    const overflowMarkup = render({ ...content, items: overflowItems })
    expect((overflowMarkup.match(/<article[^>]*data-hbar-app-ui-item-id=/g) ?? []).length).toBe(
      content.listStrategy.expectedMaximum + 1,
    )
    expect(overflowMarkup).toContain('data-hbar-app-ui-item-id="over-bound"')
    expect(overflowMarkup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })

  test('keeps long German labels and category copy in the host fixture', () => {
    const content = createIntegrationMarketplaceReferenceFixture('de-long')
    const markup = render(content)

    expect(markup).toContain('Verfügbare Integrationen')
    expect(markup).toContain('2 verbunden · 9 verfügbare Integrationen für Daten, Entwicklung und Sicherheit')
    expect(markup).toContain('Nach Anbieter, Kategorie oder Beschreibung suchen')
    expect(markup).toContain('Integrationskategorien')
    expect(markup).toContain('Verbunden')
    expect(markup).toContain('Verbinden')
    expect(markup).toContain('Auffällige Anmeldungen an Ihr SIEM senden.')
  })
})
