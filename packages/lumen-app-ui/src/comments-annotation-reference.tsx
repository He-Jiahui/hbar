'use client'

import type { LumenCommentsAction, LumenCommentsListStrategy } from './comments'
import './comments-annotation-reference.css'

export interface LumenCommentsDocumentSegment {
  readonly id: string
  readonly text: string
  readonly commentId?: string | undefined
}
export interface LumenCommentsDocumentAnnotation {
  readonly id: string
  readonly initials: string
  readonly author: string
  readonly meta: string
  readonly quote: string
  readonly body: string
  readonly resolved: boolean
}
export interface LumenCommentsAnnotationReferenceContent {
  readonly labels: {
    readonly title: string
    readonly summary: (open: number, total: number) => string
    readonly comments: string
    readonly resolve: string
    readonly resolved: string
    readonly showInText: string
    readonly showComment: (text: string) => string
    readonly review: string
    readonly reviewSummary: (open: number) => string
    readonly empty: string
  }
  readonly segments: readonly LumenCommentsDocumentSegment[]
  readonly annotations: readonly LumenCommentsDocumentAnnotation[]
  readonly activeId: string
  readonly listStrategy: LumenCommentsListStrategy
  readonly onSelectionChange?: ((id: string) => void) | undefined
  readonly onResolveToggle?: ((id: string) => void) | undefined
}

export function uniqueLumenDocumentItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function AnnotationIcon({ comment = false }: { readonly comment?: boolean | undefined }) {
  return (
    <svg className="lumen-comments-document-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={comment ? 'M2 2.5h12v9H6l-4 3v-12Z' : 'm3 8 3 3 7-7'} />
    </svg>
  )
}

export function LumenCommentsAnnotationReference({
  content,
  onAction,
}: {
  readonly content: LumenCommentsAnnotationReferenceContent
  readonly onAction: ((event: LumenCommentsAction) => void) | undefined
}) {
  const annotations = uniqueLumenDocumentItems(content.annotations)
  const segments = uniqueLumenDocumentItems(content.segments)
  const selected = annotations.find((item) => item.id === content.activeId) ?? annotations[0]
  const openCount = annotations.filter((item) => !item.resolved).length
  const select = (id: string) => {
    content.onSelectionChange?.(id)
    onAction?.({ actionId: 'select-annotation', value: id })
  }
  return (
    <div className="lumen-comments-document">
      <header data-hbar-app-ui-region="annotation-header">
        <h2>{content.labels.title}</h2>
        <p>
          <span className="lumen-comments-document-dot" aria-hidden="true" />
          {content.labels.summary(openCount, annotations.length)}
        </p>
      </header>
      <div className="lumen-comments-document-layout">
        <div className="lumen-comments-document-paper" data-hbar-app-ui-region="document">
          <div className="lumen-comments-document-prose" data-hbar-app-ui-list-strategy="pane-scroll">
            <p>
              {segments.map((segment) => {
                const annotation = annotations.find((item) => item.id === segment.commentId)
                return annotation ? (
                  <button
                    key={segment.id}
                    type="button"
                    className={[
                      'lumen-comments-document-highlight',
                      selected?.id === annotation.id ? 'is-active' : '',
                      annotation.resolved ? 'is-resolved' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-label={content.labels.showComment(segment.text)}
                    data-hbar-app-ui-action="select-annotation"
                    data-hbar-app-ui-target={annotation.id}
                    onClick={() => select(annotation.id)}
                  >
                    {segment.text}
                  </button>
                ) : (
                  <span key={segment.id}>{segment.text}</span>
                )
              })}
            </p>
          </div>
        </div>
        <aside className="lumen-comments-document-rail" data-hbar-app-ui-region="annotations">
          <p className="lumen-comments-document-rail-label">{content.labels.comments}</p>
          <div className="lumen-comments-document-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            {annotations.length === 0 ? (
              <p>{content.labels.empty}</p>
            ) : (
              annotations.map((annotation) => (
                <div
                  className={[
                    'lumen-comments-document-card',
                    selected?.id === annotation.id && !annotation.resolved ? 'is-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={annotation.id}
                >
                  <div className="lumen-comments-document-byline">
                    <span className="lumen-comments-document-avatar" aria-hidden="true">
                      {annotation.initials}
                    </span>
                    <p>{annotation.author}</p>
                    <span>{annotation.meta}</span>
                  </div>
                  <p className="lumen-comments-document-quote">{annotation.quote}</p>
                  <p
                    className={['lumen-comments-document-note', annotation.resolved ? 'is-resolved' : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {annotation.body}
                  </p>
                  <div className="lumen-comments-document-actions">
                    <button
                      type="button"
                      aria-pressed={annotation.resolved}
                      data-hbar-app-ui-action="toggle-resolved"
                      data-hbar-app-ui-target={annotation.id}
                      onClick={() => {
                        content.onResolveToggle?.(annotation.id)
                        onAction?.({ actionId: 'toggle-resolved', value: annotation.id })
                      }}
                    >
                      <AnnotationIcon />
                      {annotation.resolved ? content.labels.resolved : content.labels.resolve}
                    </button>
                    <button
                      type="button"
                      data-hbar-app-ui-action="show-in-text"
                      data-hbar-app-ui-target={annotation.id}
                      onClick={() => select(annotation.id)}
                    >
                      {content.labels.showInText}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
        <div className="lumen-comments-document-review-frame">
          <div className="lumen-comments-document-review" data-hbar-app-ui-region="annotation-review">
            <p>
              <AnnotationIcon comment />
              {content.labels.reviewSummary(openCount)}
            </p>
            <button type="button" data-hbar-app-ui-action="review" onClick={() => onAction?.({ actionId: 'review' })}>
              {content.labels.review}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
