'use client'

import * as React from 'react'
import { Star } from 'lucide-react'
import type { LumenFeedbackAction, LumenFeedbackListStrategy } from './feedback-workflows'
import './feedback-rating-reference.css'

export interface LumenFeedbackRatingReferenceReason {
  readonly id: string
  readonly label: string
}
export interface LumenFeedbackRatingReferenceOption {
  readonly value: number
  readonly label: string
  readonly shortLabel: string
}

export interface LumenFeedbackRatingReferenceContent {
  readonly ticketId: string
  readonly labels: {
    readonly question: string
    readonly ratingGroup: string
    readonly tapPrompt: string
    readonly lowReasonPrompt: string
    readonly highReasonPrompt: string
    readonly comment: string
    readonly commentPlaceholder: string
    readonly noThanks: string
    readonly send: string
    readonly emptyRatings: string
  }
  readonly ticket: {
    readonly initials: string
    readonly header: string
    readonly summary: string
  }
  readonly ratings: readonly LumenFeedbackRatingReferenceOption[]
  readonly lowReasons: readonly LumenFeedbackRatingReferenceReason[]
  readonly highReasons: readonly LumenFeedbackRatingReferenceReason[]
  readonly selectedRating: number | undefined
  readonly selectedReasonIds: readonly string[]
  readonly comment: string
  readonly ratingStrategy: LumenFeedbackListStrategy
  readonly reasonStrategy: LumenFeedbackListStrategy
  readonly onSelectRating?: ((ticketId: string, rating: number) => void) | undefined
  readonly onToggleReason?: ((ticketId: string, reasonId: string) => void) | undefined
  readonly onCommentChange?: ((ticketId: string, comment: string) => void) | undefined
  readonly onSend?: ((ticketId: string) => void) | undefined
  readonly onNoThanks?: ((ticketId: string) => void) | undefined
}

export function uniqueLumenFeedbackRatingOptions(
  ratings: readonly LumenFeedbackRatingReferenceOption[],
): readonly LumenFeedbackRatingReferenceOption[] {
  const seen = new Set<number>()
  return ratings.filter((rating) => {
    if (!Number.isInteger(rating.value) || rating.value < 1 || rating.value > 5 || seen.has(rating.value)) return false
    seen.add(rating.value)
    return true
  })
}

export function uniqueLumenFeedbackRatingReasons(
  reasons: readonly LumenFeedbackRatingReferenceReason[],
): readonly LumenFeedbackRatingReferenceReason[] {
  const seen = new Set<string>()
  return reasons.filter((reason) => {
    if (seen.has(reason.id)) return false
    seen.add(reason.id)
    return true
  })
}

export function LumenFeedbackRatingReference({
  content,
  onAction,
}: {
  readonly content: LumenFeedbackRatingReferenceContent
  readonly onAction: ((event: LumenFeedbackAction) => void) | undefined
}): React.ReactElement {
  const ratings = uniqueLumenFeedbackRatingOptions(content.ratings)
  const selected = ratings.find((rating) => rating.value === content.selectedRating)
  const [hovered, setHovered] = React.useState<number | undefined>()
  const preview = ratings.find((rating) => rating.value === hovered) ?? selected
  const reasons = uniqueLumenFeedbackRatingReasons(
    selected && selected.value >= 4 ? content.highReasons : content.lowReasons,
  )
  const panelRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const panel = panelRef.current
    const viewport = panel?.closest<HTMLElement>('.lumen-feedback-rating-reference')
    if (!panel || !viewport) return
    const center = () => {
      viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2)
    }
    const observer = new ResizeObserver(center)
    observer.observe(panel)
    observer.observe(viewport)
    center()
    return () => observer.disconnect()
  }, [selected?.value])
  return (
    <div ref={panelRef} className="lumen-feedback-rating-reference-panel">
      <div className="lumen-feedback-rating-reference-ticket">
        <div>
          <span aria-hidden="true">{content.ticket.initials}</span>
          <div>
            <p>{content.ticket.header}</p>
            <p>{content.ticket.summary}</p>
          </div>
        </div>
      </div>
      <h2>{content.labels.question}</h2>
      <div
        className="lumen-feedback-rating-reference-stars"
        role="radiogroup"
        aria-label={content.labels.ratingGroup}
        data-hbar-app-ui-list-strategy={content.ratingStrategy.kind}
        data-hbar-app-ui-expected-maximum={content.ratingStrategy.expectedMaximum}
      >
        {ratings.map((rating) => (
          <button
            type="button"
            role="radio"
            key={rating.value}
            aria-label={rating.label}
            aria-checked={selected?.value === rating.value}
            onMouseEnter={() => setHovered(rating.value)}
            onMouseLeave={() => setHovered(undefined)}
            onFocus={() => setHovered(rating.value)}
            onBlur={() => setHovered(undefined)}
            onClick={() => {
              content.onSelectRating?.(content.ticketId, rating.value)
              onAction?.({ actionId: 'rating', value: String(rating.value) })
            }}
          >
            <Star
              data-icon-tier="xl"
              strokeWidth={2}
              fill={preview && rating.value <= preview.value ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
          </button>
        ))}
        {ratings.length === 0 ? <p>{content.labels.emptyRatings}</p> : null}
      </div>
      <p className="lumen-feedback-rating-reference-caption">{preview?.shortLabel ?? content.labels.tapPrompt}</p>
      <div className="lumen-feedback-rating-reference-detail" inert={!selected} aria-hidden={!selected}>
        <p>
          {selected?.value && selected.value >= 4 ? content.labels.highReasonPrompt : content.labels.lowReasonPrompt}
        </p>
        <div
          className="lumen-feedback-rating-reference-reasons"
          data-hbar-app-ui-list-strategy={content.reasonStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.reasonStrategy.expectedMaximum}
        >
          {reasons.map((reason) => (
            <button
              type="button"
              key={reason.id}
              aria-pressed={content.selectedReasonIds.includes(reason.id)}
              onClick={() => {
                content.onToggleReason?.(content.ticketId, reason.id)
                onAction?.({ actionId: 'reason', value: reason.id })
              }}
            >
              {reason.label}
            </button>
          ))}
        </div>
        <label className="lumen-feedback-reference-visually-hidden" htmlFor={`${content.ticketId}-rating-comment`}>
          {content.labels.comment}
        </label>
        <textarea
          id={`${content.ticketId}-rating-comment`}
          value={content.comment}
          placeholder={content.labels.commentPlaceholder}
          onChange={(event) => content.onCommentChange?.(content.ticketId, event.target.value)}
        />
      </div>
      <div className="lumen-feedback-rating-reference-actions">
        <button
          type="button"
          onClick={() => {
            content.onNoThanks?.(content.ticketId)
            onAction?.({ actionId: 'no-thanks' })
          }}
        >
          {content.labels.noThanks}
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            content.onSend?.(content.ticketId)
            onAction?.({ actionId: 'send', value: String(selected?.value) })
          }}
        >
          {content.labels.send}
        </button>
      </div>
    </div>
  )
}
