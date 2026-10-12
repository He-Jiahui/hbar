'use client'

import * as React from 'react'
import { LumenInput } from '../forms'
import type { LumenIntegrationMarketplaceContent } from './content'
import { uniqueLumenIntegrationItems } from './content'
import type { LumenIntegrationMarketplaceReferenceLayout } from './reference-content'
import type { LumenIntegrationsCompositionProps } from './primitives'
import { IntegrationButton, IntegrationEmpty, IntegrationFrame, IntegrationIcon } from './primitives'
import { Check, Plus, Search } from './glyphs'
import './reference-marketplace.css'

export interface ReferenceMarketplaceIntegrationProps extends LumenIntegrationsCompositionProps {
  readonly content: LumenIntegrationMarketplaceContent
  readonly layout: LumenIntegrationMarketplaceReferenceLayout
}

export function ReferenceMarketplaceIntegration({
  spec,
  onAction,
  content,
  layout,
}: ReferenceMarketplaceIntegrationProps) {
  const searchId = React.useId()
  const itemsId = React.useId()
  const tabListRef = React.useRef<HTMLDivElement>(null)
  const categories = uniqueLumenIntegrationItems(content.categories)
  const items = uniqueLumenIntegrationItems(content.items)
  const flow = content.referenceFlow
  const query = flow?.query ?? ''
  const requestedCategoryId = flow?.categoryId ?? content.initialCategoryId
  const selectedCategory =
    categories.find((category) => category.id === requestedCategoryId) ??
    categories.find((category) => category.id === content.allCategoryId) ??
    categories[0]
  const selectedCategoryId = selectedCategory?.id ?? null
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredItems = items.filter((item) => {
    const matchesCategory =
      selectedCategoryId === null ||
      selectedCategoryId === content.allCategoryId ||
      item.categoryId === selectedCategoryId
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [item.name, item.categoryLabel, item.description].join(' ').toLocaleLowerCase().includes(normalizedQuery)
    return matchesCategory && matchesQuery
  })

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!flow || categories.length === 0) {
      return
    }

    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % categories.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + categories.length) % categories.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = categories.length - 1
    }
    if (nextIndex === undefined) {
      return
    }

    event.preventDefault()
    const nextCategory = categories[nextIndex]
    if (!nextCategory) {
      return
    }
    flow.onCategoryChange(nextCategory.id)
    tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]').item(nextIndex)?.focus()
  }

  const requestCardIntent = (itemId: string, connected: boolean) => {
    onAction?.({
      variantId: spec.id,
      actionId: connected ? 'open-integration' : 'connect-integration',
      value: itemId,
    })
  }

  return (
    <IntegrationFrame spec={spec} onAction={onAction} className="hbar-app-ui-integration-marketplace-reference-surface">
      <main className="hbar-app-ui-integration-marketplace-reference" data-hbar-app-ui-owner-id={layout.ownerId}>
        <header className="hbar-app-ui-integration-marketplace-reference-header">
          <div className="hbar-app-ui-integration-marketplace-reference-heading">
            <h2>{content.labels.pageTitle}</h2>
            <p>{content.labels.pageDescription}</p>
          </div>
          <label className="hbar-app-ui-integration-marketplace-reference-search" htmlFor={searchId}>
            <IntegrationIcon tier="sm">
              <Search />
            </IntegrationIcon>
            <LumenInput
              id={searchId}
              type="search"
              variant="plain"
              aria-label={content.labels.searchLabel}
              placeholder={content.labels.searchPlaceholder}
              autoComplete="off"
              value={query}
              readOnly={!flow}
              data-hbar-app-ui-action="integration-marketplace:search"
              data-hbar-app-ui-field="integration-search"
              onChange={(event) => flow?.onQueryChange(event.currentTarget.value)}
            />
          </label>
        </header>

        <div
          ref={tabListRef}
          className="hbar-app-ui-integration-marketplace-reference-tabs"
          role="tablist"
          aria-label={content.labels.categoriesLabel}
          data-hbar-app-ui-region="integration-categories"
        >
          {categories.map((category, index) => {
            const selected = category.id === selectedCategoryId
            return (
              <IntegrationButton
                key={category.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={itemsId}
                tabIndex={selected ? 0 : -1}
                disabled={!flow}
                data-hbar-app-ui-item-id={category.id}
                data-hbar-app-ui-action="integration-marketplace:select-category"
                onClick={() => flow?.onCategoryChange(category.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                {category.label}
              </IntegrationButton>
            )
          })}
        </div>

        <section
          id={itemsId}
          className="hbar-app-ui-integration-marketplace-reference-list"
          role="tabpanel"
          tabIndex={0}
          aria-label={content.labels.pageTitle}
          data-hbar-app-ui-region="integration-marketplace-items"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          {filteredItems.length ? (
            filteredItems.map((item) => (
              <article
                className="hbar-app-ui-integration-marketplace-reference-card"
                key={item.id}
                data-hbar-app-ui-item-id={item.id}
              >
                <header>
                  <span className="hbar-app-ui-integration-marketplace-reference-avatar">{item.initials}</span>
                  <div>
                    <h3>{item.name}</h3>
                    <small>{item.categoryLabel}</small>
                  </div>
                </header>
                <p>{item.description}</p>
                <IntegrationButton
                  className="hbar-app-ui-integration-marketplace-reference-card-action"
                  type="button"
                  tone={item.connected ? 'neutral' : 'accent'}
                  data-hbar-app-ui-action={
                    item.connected
                      ? 'integration-marketplace:open-integration'
                      : 'integration-marketplace:connect-integration'
                  }
                  onClick={() => requestCardIntent(item.id, item.connected)}
                >
                  <IntegrationIcon tier="sm">{item.connected ? <Check /> : <Plus />}</IntegrationIcon>
                  {item.connected ? content.labels.connected : content.labels.connect}
                </IntegrationButton>
              </article>
            ))
          ) : (
            <IntegrationEmpty message={content.labels.empty} />
          )}
        </section>
      </main>
    </IntegrationFrame>
  )
}
