'use client'

import * as React from 'react'
import { Check, MessageSquare, Sparkles, Undo2, X } from 'lucide-react'
import type {
  LumenEditorAction,
  LumenEditorInlineSegment,
  LumenSuggestion,
  LumenSuggestionAction,
  LumenSuggestionReviewDocument,
} from './editor'
import './editor-suggestions-reference.css'

export interface LumenSuggestionsReferenceContent {
  readonly labels: {
    readonly panel: string
    readonly acceptAll: string
    readonly accept: string
    readonly resolve: string
    readonly dismiss: string
    readonly openCount: (count: number) => string
    readonly remainingCount: (count: number) => string
    readonly completeTitle: string
    readonly completeBody: string
    readonly restore: string
  }
  readonly document: LumenSuggestionReviewDocument
  readonly suggestions: readonly LumenSuggestion[]
  readonly selectedSuggestionId: string | undefined
  readonly decisions: Readonly<Record<string, LumenSuggestionAction | 'dismiss'>>
  readonly paneStrategy: Readonly<{ kind: 'pane-scroll'; expectedMaximum: number }>
  readonly onSelectSuggestion?: ((documentId: string, suggestionId: string) => void) | undefined
  readonly onResolve?:
    ((documentId: string, suggestionId: string, action: LumenSuggestionAction | 'dismiss') => void) | undefined
  readonly onAcceptAll?: ((documentId: string) => void) | undefined
  readonly onRestore?: ((documentId: string) => void) | undefined
}

export function uniqueLumenReferenceSuggestions(items: readonly LumenSuggestion[]): readonly LumenSuggestion[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function ReviewParagraph({
  segments,
  content,
  onAction,
}: {
  readonly segments: readonly LumenEditorInlineSegment[]
  readonly content: LumenSuggestionsReferenceContent
  readonly onAction: ((action: LumenEditorAction) => void) | undefined
}): React.ReactElement {
  return (
    <p>
      {segments.map((segment, index) => {
        const key = segment.kind === 'suggestion' ? `${segment.suggestionId}-${index}` : `${segment.kind}-${index}`
        if (segment.kind === 'strong') return <strong key={key}>{segment.value}</strong>
        if (segment.kind === 'emphasis') return <em key={key}>{segment.value}</em>
        if (segment.kind !== 'suggestion') return <React.Fragment key={key}>{segment.value}</React.Fragment>
        const item = content.suggestions.find((suggestion) => suggestion.id === segment.suggestionId)
        const accepted = content.decisions[segment.suggestionId] === 'accept' && item?.replacement
        return (
          <button
            className={`lumen-suggestions-reference-inline ${content.decisions[segment.suggestionId] ? 'is-decided' : ''} ${accepted ? 'is-accepted' : ''}`}
            type="button"
            key={key}
            onClick={() => {
              content.onSelectSuggestion?.(content.document.id, segment.suggestionId)
              onAction?.({ actionId: 'open-suggestion', value: segment.suggestionId })
            }}
          >
            {accepted || segment.value}
          </button>
        )
      })}
    </p>
  )
}

export function LumenSuggestionsReference({
  content,
  onAction,
}: {
  readonly content: LumenSuggestionsReferenceContent
  readonly onAction: ((action: LumenEditorAction) => void) | undefined
}): React.ReactElement {
  const suggestions = uniqueLumenReferenceSuggestions(content.suggestions)
  const remaining = suggestions.filter((item) => !content.decisions[item.id])
  const selected = remaining.some((item) => item.id === content.selectedSuggestionId)
    ? content.selectedSuggestionId
    : remaining[0]?.id
  const resolve = (item: LumenSuggestion, action: LumenSuggestionAction | 'dismiss') => {
    content.onResolve?.(content.document.id, item.id, action)
    onAction?.({ actionId: action, value: item.id })
  }
  return (
    <>
      <div className="lumen-suggestions-reference-document" data-remaining={remaining.length}>
        <header className="lumen-suggestions-reference-document-header" role="banner">
          <div className="lumen-suggestions-reference-title">
            <h2>{content.document.title}</h2>
            <p>{content.document.summary}</p>
          </div>
          <span className="lumen-suggestions-reference-count">
            <MessageSquare
              className="lumen-suggestions-reference-icon"
              data-icon-tier="sm"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            {content.labels.openCount(remaining.length)}
          </span>
        </header>
        <div
          className="lumen-suggestions-reference-copy"
          data-hbar-app-ui-list-strategy={content.paneStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.paneStrategy.expectedMaximum}
        >
          <div className="lumen-suggestions-reference-prose">
            {content.document.paragraphs.map((paragraph) => (
              <ReviewParagraph key={paragraph.id} segments={paragraph.segments} content={content} onAction={onAction} />
            ))}
          </div>
        </div>
      </div>
      <aside className="lumen-suggestions-reference-panel" role="complementary">
        <div className="lumen-suggestions-reference-panel-header">
          <span>{content.labels.panel}</span>
          {remaining.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                content.onAcceptAll?.(content.document.id)
                onAction?.({ actionId: 'accept-all' })
              }}
            >
              {content.labels.acceptAll}
            </button>
          ) : null}
        </div>
        <div
          className="lumen-suggestions-reference-list"
          data-hbar-app-ui-list-strategy={content.paneStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.paneStrategy.expectedMaximum}
        >
          {remaining.length > 0 ? (
            remaining.map((item) => (
              <article
                key={item.id}
                className={`lumen-suggestions-reference-card ${selected === item.id ? 'is-selected' : ''}`}
              >
                <div className="lumen-suggestions-reference-author">
                  <span className="lumen-suggestions-reference-avatar" aria-hidden="true">
                    {item.initials}
                  </span>
                  <span className="lumen-suggestions-reference-author-name">{item.author}</span>
                  <span className="lumen-suggestions-reference-age">{item.age}</span>
                </div>
                <div className="lumen-suggestions-reference-change">
                  <p className={item.replacement ? 'is-removed' : ''}>{item.selected}</p>
                  {item.replacement ? <p>{item.replacement}</p> : null}
                </div>
                <p className="lumen-suggestions-reference-detail">{item.detail}</p>
                <div className="lumen-suggestions-reference-actions">
                  <button
                    type="button"
                    className="lumen-suggestions-reference-primary"
                    onClick={() => resolve(item, item.primaryAction)}
                  >
                    <Check
                      className="lumen-suggestions-reference-icon"
                      data-icon-tier="sm"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    {item.primaryAction === 'resolve' ? content.labels.resolve : content.labels.accept}
                  </button>
                  <button
                    type="button"
                    className="lumen-suggestions-reference-dismiss"
                    onClick={() => resolve(item, 'dismiss')}
                  >
                    <X
                      className="lumen-suggestions-reference-icon"
                      data-icon-tier="sm"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    {content.labels.dismiss}
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="lumen-suggestions-reference-complete">
              <span className="lumen-suggestions-reference-complete-symbol">
                <Sparkles
                  className="lumen-suggestions-reference-complete-icon"
                  data-icon-tier="md"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </span>
              <p>{content.labels.completeTitle}</p>
              <p>{content.labels.completeBody}</p>
              <button
                type="button"
                onClick={() => {
                  content.onRestore?.(content.document.id)
                  onAction?.({ actionId: 'restore' })
                }}
              >
                <Undo2
                  className="lumen-suggestions-reference-icon"
                  data-icon-tier="sm"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                {content.labels.restore}
              </button>
            </div>
          )}
        </div>
        <span className="lumen-suggestions-reference-visually-hidden">
          {content.labels.remainingCount(remaining.length)}
        </span>
      </aside>
    </>
  )
}
