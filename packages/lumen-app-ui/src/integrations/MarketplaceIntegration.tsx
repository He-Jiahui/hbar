'use client'
import * as React from 'react'
import { LumenInput } from '../forms'
import { Check, Plus, Search } from './glyphs'
import type { LumenIntegrationsCompositionProps } from './primitives'
import type { LumenIntegrationMarketplaceContent } from './content'
import { selectLumenIntegrationItem, uniqueLumenIntegrationItems } from './content'
import { IntegrationButton, IntegrationEmpty, IntegrationFrame, IntegrationIcon } from './primitives'

export default function MarketplaceIntegration({
  spec,
  onAction,
  content,
}: LumenIntegrationsCompositionProps & {
  readonly content: LumenIntegrationMarketplaceContent
}) {
  const categories = React.useMemo(() => uniqueLumenIntegrationItems(content.categories), [content.categories])
  const initialCategory = selectLumenIntegrationItem(categories, content.initialCategoryId)
  const [categoryId, setCategoryId] = React.useState(initialCategory?.id ?? '')
  const [query, setQuery] = React.useState('')
  const [connectedIds, setConnectedIds] = React.useState<ReadonlySet<string>>(
    () => new Set(content.items.filter((item) => item.connected).map((item) => item.id)),
  )
  const filteredItems = React.useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return uniqueLumenIntegrationItems(content.items).filter((item) => {
      const categoryMatches = !categoryId || categoryId === content.allCategoryId || item.categoryId === categoryId
      const queryMatches =
        !normalized ||
        [item.name, item.categoryLabel, item.description].join(' ').toLocaleLowerCase().includes(normalized)
      return categoryMatches && queryMatches
    })
  }, [categoryId, content.allCategoryId, content.items, query])

  const toggleConnection = (itemId: string) => {
    setConnectedIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
    onAction?.({ variantId: spec.id, actionId: 'toggle-connection', value: itemId })
  }

  return (
    <IntegrationFrame spec={spec} className="hbar-app-ui-integration-marketplace-surface">
      <main className="hbar-app-ui-integration-page">
        <header className="hbar-app-ui-integration-topbar">
          <div>
            <h1>{content.labels.pageTitle}</h1>
            <p>{content.labels.pageDescription}</p>
          </div>
          <div className="hbar-app-ui-integration-search">
            <IntegrationIcon tier="sm">
              <Search />
            </IntegrationIcon>
            <LumenInput
              type="search"
              aria-label={content.labels.searchLabel}
              placeholder={content.labels.searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </header>
        <div className="hbar-app-ui-integration-market-tabs" role="group" aria-label={content.labels.categoriesLabel}>
          {categories.map((category) => (
            <IntegrationButton
              key={category.id}
              type="button"
              aria-pressed={category.id === categoryId}
              onClick={() => {
                setCategoryId(category.id)
                onAction?.({ variantId: spec.id, actionId: 'select-category', value: category.id })
              }}
            >
              {category.label}
            </IntegrationButton>
          ))}
        </div>
        <section
          className="hbar-app-ui-integration-market-list"
          role="list"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          {filteredItems.length ? (
            filteredItems.map((item) => {
              const connected = connectedIds.has(item.id)
              return (
                <article
                  className="hbar-app-ui-integration-market-card"
                  role="listitem"
                  key={item.id}
                  data-hbar-app-ui-item-id={item.id}
                >
                  <header>
                    <span className="hbar-app-ui-integration-avatar">{item.initials}</span>
                    <div>
                      <h2>{item.name}</h2>
                      <small>{item.categoryLabel}</small>
                    </div>
                  </header>
                  <p>{item.description}</p>
                  <IntegrationButton
                    type="button"
                    tone={connected ? 'neutral' : 'accent'}
                    aria-label={content.labels.connectAction(item.name)}
                    onClick={() => toggleConnection(item.id)}
                  >
                    <IntegrationIcon tier="sm">{connected ? <Check /> : <Plus />}</IntegrationIcon>
                    {connected ? content.labels.connected : content.labels.connect}
                  </IntegrationButton>
                </article>
              )
            })
          ) : (
            <IntegrationEmpty message={content.labels.empty} />
          )}
        </section>
      </main>
    </IntegrationFrame>
  )
}
