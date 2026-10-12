'use client'

import * as React from 'react'
import type { LumenCommentsAction, LumenCommentsListStrategy } from './comments'
import {
  projectLumenCommentsInbox,
  uniqueLumenCommentsInboxItems,
  type LumenCommentsInboxFilter,
  type LumenCommentsInboxReferenceItem,
} from './comments-inbox-model'
import './comments-inbox-reference.css'

export interface LumenCommentsInboxReferenceContent {
  readonly labels: {
    readonly title: string
    readonly summary: (unresolved: number, documents: number) => string
    readonly filterLabel: string
    readonly mention: string
    readonly resolve: (author: string) => string
    readonly reopen: (author: string) => string
    readonly emptyTitle: string
    readonly emptyDetail: string
  }
  readonly filters: readonly LumenCommentsInboxFilter[]
  readonly filterId: string
  readonly items: readonly LumenCommentsInboxReferenceItem[]
  readonly listStrategy: LumenCommentsListStrategy
  readonly onFilterChange?: ((id: string) => void) | undefined
  readonly onResolvedChange?: ((id: string, resolved: boolean) => void) | undefined
}
function InboxIcon({ kind }: { readonly kind: 'inbox' | 'check' }): React.ReactElement {
  return (
    <svg className={`lumen-comments-inbox-icon is-${kind}`} viewBox="0 0 16 16" aria-hidden="true">
      {kind === 'inbox' ? (
        <path d="M2 6.5 4.3 2h7.4L14 6.5v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Zm0 0h3l1.2 2.3h3.6L11 6.5h3" />
      ) : (
        <path d="m3 8 3 3 7-7" />
      )}
    </svg>
  )
}
export function LumenCommentsInboxReference({
  content,
  onAction,
}: {
  readonly content: LumenCommentsInboxReferenceContent
  readonly onAction: ((event: LumenCommentsAction) => void) | undefined
}): React.ReactElement {
  const filters = uniqueLumenCommentsInboxItems(content.filters)
  const selected = filters.find((filter) => filter.id === content.filterId) ?? filters[0]
  const projection = projectLumenCommentsInbox(content.items, selected?.kind ?? 'all')
  return (
    <div className="lumen-comments-inbox-layout">
      <header data-hbar-app-ui-region="inbox-header">
        <div>
          <h2>
            <InboxIcon kind="inbox" />
            {content.labels.title}
          </h2>
          <p>{content.labels.summary(projection.unresolved, projection.documents)}</p>
        </div>
        <div className="lumen-comments-inbox-filters" role="tablist" aria-label={content.labels.filterLabel}>
          {filters.map((filter) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter.id === selected?.id}
              key={filter.id}
              data-hbar-app-ui-action="filter"
              data-hbar-app-ui-target={filter.id}
              onClick={() => {
                content.onFilterChange?.(filter.id)
                onAction?.({ actionId: 'filter', value: filter.id })
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>
      <div className="lumen-comments-inbox-frame">
        <div
          className="lumen-comments-inbox-items"
          data-hbar-app-ui-region="inbox-items"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          {projection.items.length ? (
            projection.items.map((item) => (
              <article key={item.id} data-hbar-app-ui-target={item.id}>
                <span className="lumen-comments-inbox-avatar" aria-hidden="true">
                  {item.initials}
                </span>
                <div className="lumen-comments-inbox-message">
                  <div className="lumen-comments-inbox-byline">
                    <p>{item.author}</p>
                    <span>{item.time}</span>
                    {item.mentioned && !item.resolved ? (
                      <span className="lumen-comments-inbox-mention">{content.labels.mention}</span>
                    ) : null}
                  </div>
                  <p className="lumen-comments-inbox-context">{item.context}</p>
                  <p className={`lumen-comments-inbox-body${item.resolved ? ' is-resolved' : ''}`}>{item.body}</p>
                </div>
                <button
                  type="button"
                  className="lumen-comments-inbox-resolve"
                  aria-pressed={item.resolved}
                  aria-label={item.resolved ? content.labels.reopen(item.author) : content.labels.resolve(item.author)}
                  data-hbar-app-ui-action="toggle-resolved"
                  data-hbar-app-ui-target={item.id}
                  onClick={() => {
                    content.onResolvedChange?.(item.id, !item.resolved)
                    onAction?.({ actionId: 'toggle-resolved', value: item.id })
                  }}
                >
                  <InboxIcon kind="check" />
                </button>
              </article>
            ))
          ) : (
            <div className="lumen-comments-inbox-empty">
              <p>{content.labels.emptyTitle}</p>
              <p>{content.labels.emptyDetail}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
