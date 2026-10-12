'use client'

import * as React from 'react'
import { Check, X } from 'lucide-react'
import type { LumenFeedbackAction, LumenFeedbackListStrategy } from './feedback-workflows'
import './feedback-survey-reference.css'

export interface LumenFeedbackSurveyReferenceReason {
  readonly id: string
  readonly label: string
}

export interface LumenFeedbackSurveyReferenceContent {
  readonly surveyId: string
  readonly labels: {
    readonly eyebrow: string
    readonly question: string
    readonly dismiss: string
    readonly scoreGroup: string
    readonly scoreLow: string
    readonly scoreHigh: string
    readonly scorePrompt: string
    readonly lowFollowUp: string
    readonly middleFollowUp: string
    readonly highFollowUp: string
    readonly comment: string
    readonly commentPlaceholder: string
    readonly note: string
    readonly later: string
    readonly submit: string
    readonly sentTitle: string
    readonly sentDescription: (score: number) => string
    readonly emptyScores: string
    readonly scoreAccessible: (score: number) => string
  }
  readonly scores: readonly number[]
  readonly reasons: readonly LumenFeedbackSurveyReferenceReason[]
  readonly selectedScore: number | undefined
  readonly selectedReasonIds: readonly string[]
  readonly comment: string
  readonly phase: 'editing' | 'sent'
  readonly scoreStrategy: LumenFeedbackListStrategy
  readonly reasonStrategy: LumenFeedbackListStrategy
  readonly onSelectScore?: ((surveyId: string, score: number) => void) | undefined
  readonly onToggleReason?: ((surveyId: string, reasonId: string) => void) | undefined
  readonly onCommentChange?: ((surveyId: string, comment: string) => void) | undefined
  readonly onSubmit?: ((surveyId: string) => void) | undefined
  readonly onLater?: ((surveyId: string) => void) | undefined
  readonly onDismiss?: ((surveyId: string) => void) | undefined
}

export function uniqueLumenFeedbackSurveyScores(scores: readonly number[]): readonly number[] {
  return [...new Set(scores.filter((score) => Number.isInteger(score) && score >= 0 && score <= 10))]
}

export function uniqueLumenFeedbackSurveyReasons(
  reasons: readonly LumenFeedbackSurveyReferenceReason[],
): readonly LumenFeedbackSurveyReferenceReason[] {
  const seen = new Set<string>()
  return reasons.filter((reason) => {
    if (seen.has(reason.id)) return false
    seen.add(reason.id)
    return true
  })
}

export function LumenFeedbackSurveyReference({
  content,
  onAction,
}: {
  readonly content: LumenFeedbackSurveyReferenceContent
  readonly onAction: ((event: LumenFeedbackAction) => void) | undefined
}): React.ReactElement {
  const scores = uniqueLumenFeedbackSurveyScores(content.scores)
  const reasons = uniqueLumenFeedbackSurveyReasons(content.reasons)
  const selected = scores.includes(content.selectedScore ?? -1) ? content.selectedScore : undefined
  const panelRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const panel = panelRef.current
    const viewport = panel?.closest<HTMLElement>('.lumen-feedback-survey-reference')
    if (!panel || !viewport) return
    // Center the source's content-grown form while retaining native scroll access
    // to the clipped ends on short preview canvases.
    const center = () => {
      viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2)
    }
    const observer = new ResizeObserver(center)
    observer.observe(panel)
    observer.observe(viewport)
    center()
    return () => observer.disconnect()
  }, [selected, content.phase])
  const followUp =
    selected === undefined
      ? content.labels.scorePrompt
      : selected <= 6
        ? content.labels.lowFollowUp
        : selected <= 8
          ? content.labels.middleFollowUp
          : content.labels.highFollowUp

  return (
    <div ref={panelRef} className="lumen-feedback-survey-reference-panel">
      <div className="lumen-feedback-survey-reference-header">
        <div>
          <p>{content.labels.eyebrow}</p>
          <h2>{content.labels.question}</h2>
        </div>
        <button
          type="button"
          aria-label={content.labels.dismiss}
          onClick={() => {
            content.onDismiss?.(content.surveyId)
            onAction?.({ actionId: 'dismiss' })
          }}
        >
          <X data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      {content.phase === 'sent' && selected !== undefined ? (
        <div className="lumen-feedback-survey-reference-sent">
          <div>
            <span>
              <Check data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div>
              <p>{content.labels.sentTitle}</p>
              <p>{content.labels.sentDescription(selected)}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            className="lumen-feedback-survey-reference-scale"
            role="radiogroup"
            aria-label={content.labels.scoreGroup}
            data-hbar-app-ui-list-strategy={content.scoreStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.scoreStrategy.expectedMaximum}
          >
            {scores.map((score) => (
              <button
                type="button"
                role="radio"
                key={score}
                aria-label={content.labels.scoreAccessible(score)}
                aria-checked={selected === score}
                onClick={() => {
                  content.onSelectScore?.(content.surveyId, score)
                  onAction?.({ actionId: 'score', value: String(score) })
                }}
              >
                {score}
              </button>
            ))}
            {scores.length === 0 ? <p>{content.labels.emptyScores}</p> : null}
          </div>
          <div className="lumen-feedback-survey-reference-ends">
            <span>{content.labels.scoreLow}</span>
            <span>{content.labels.scoreHigh}</span>
          </div>
          <div
            className="lumen-feedback-survey-reference-detail"
            inert={selected === undefined}
            aria-hidden={selected === undefined}
          >
            <p>{followUp}</p>
            <div
              className="lumen-feedback-survey-reference-reasons"
              data-hbar-app-ui-list-strategy={content.reasonStrategy.kind}
              data-hbar-app-ui-expected-maximum={content.reasonStrategy.expectedMaximum}
            >
              {reasons.map((reason) => (
                <button
                  type="button"
                  key={reason.id}
                  aria-pressed={content.selectedReasonIds.includes(reason.id)}
                  onClick={() => {
                    content.onToggleReason?.(content.surveyId, reason.id)
                    onAction?.({ actionId: 'reason', value: reason.id })
                  }}
                >
                  {reason.label}
                </button>
              ))}
            </div>
            <label className="lumen-feedback-reference-visually-hidden" htmlFor={`${content.surveyId}-comment`}>
              {content.labels.comment}
            </label>
            <textarea
              id={`${content.surveyId}-comment`}
              value={content.comment}
              placeholder={content.labels.commentPlaceholder}
              onChange={(event) => content.onCommentChange?.(content.surveyId, event.target.value)}
            />
          </div>
          <div className="lumen-feedback-survey-reference-footer">
            <p>{content.labels.note}</p>
            <div>
              <button
                type="button"
                onClick={() => {
                  content.onLater?.(content.surveyId)
                  onAction?.({ actionId: 'later' })
                }}
              >
                {content.labels.later}
              </button>
              <button
                type="button"
                disabled={selected === undefined}
                onClick={() => {
                  content.onSubmit?.(content.surveyId)
                  onAction?.({ actionId: 'submit', value: String(selected) })
                }}
              >
                {content.labels.submit}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
