'use client'

import * as React from 'react'
import LumenSurface from './LumenSurface'
import { LumenFeedbackWidgetReference, type LumenFeedbackWidgetReferenceContent } from './feedback-widget-reference'
import { LumenFeedbackSurveyReference, type LumenFeedbackSurveyReferenceContent } from './feedback-survey-reference'
import { LumenFeedbackRatingReference, type LumenFeedbackRatingReferenceContent } from './feedback-rating-reference'
import { LumenFeedbackBoardReference, type LumenFeedbackBoardReferenceContent } from './feedback-board-reference'
import { LumenFeedbackInboxReference, type LumenFeedbackInboxReferenceContent } from './feedback-inbox-reference'
import {
  LumenFeedbackInsightsReference,
  type LumenFeedbackInsightsReferenceContent,
} from './feedback-insights-reference'
import './feedback-workflows.css'
import { LumenInput, LumenTextarea } from './forms'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import { LumenChart } from './ui'
import { LumenChip, LumenProgress, LumenTabs } from './ui-controls'
import { HbarAppUiFeedback04 } from './variants/Feedback'

export type LumenFeedbackListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }

export type LumenFeedbackType = 'idea' | 'issue' | 'praise'

export interface LumenFeedbackTypeOption {
  readonly id: LumenFeedbackType
  readonly label: string
}

export interface LumenFeedbackAttachment {
  readonly name: string
  readonly countLabel: string
}

export interface LumenFeedbackWidgetContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly close: string
    readonly typeGroup: string
    readonly prompt: string
    readonly promptPlaceholder: string
    readonly attachment: string
    readonly privacyNotice: string
    readonly characterCount: (count: number, maximum: number) => string
    readonly cancel: string
    readonly send: string
    readonly sentTitle: string
    readonly sentDescription: (kind: string) => string
    readonly sendAnother: string
  }
  readonly types: readonly LumenFeedbackTypeOption[]
  readonly initialTypeId: LumenFeedbackType
  readonly attachment: LumenFeedbackAttachment
  readonly maximumCharacters: number
}

export interface LumenFeedbackSurveyReason {
  readonly id: string
  readonly label: string
}

export interface LumenFeedbackSurveyContent {
  readonly labels: {
    readonly eyebrow: string
    readonly question: string
    readonly close: string
    readonly scoreGroup: string
    readonly scoreLow: string
    readonly scoreHigh: string
    readonly scorePrompt: string
    readonly reasonGroup: string
    readonly commentPlaceholder: string
    readonly note: string
    readonly later: string
    readonly submit: string
    readonly submitted: string
    readonly scoreAccessible: (score: number) => string
  }
  readonly scores: readonly number[]
  readonly reasons: readonly LumenFeedbackSurveyReason[]
  readonly initialScore?: number | undefined
  readonly listStrategy: LumenFeedbackListStrategy
}

export interface LumenFeedbackTicket {
  readonly initials: string
  readonly agentName: string
  readonly header: string
  readonly summary: string
  readonly ticketId: string
  readonly subject: string
  readonly detail: string
}

export interface LumenFeedbackRatingOption {
  readonly value: number
  readonly label: string
}

export interface LumenFeedbackPostResolutionContent {
  readonly labels: {
    readonly question: string
    readonly ratingGroup: string
    readonly reasonGroup: string
    readonly commentPlaceholder: string
    readonly noThanks: string
    readonly submit: string
    readonly submitted: string
  }
  readonly ticket: LumenFeedbackTicket
  readonly ratings: readonly LumenFeedbackRatingOption[]
  readonly reasons: readonly LumenFeedbackSurveyReason[]
  readonly listStrategy: LumenFeedbackListStrategy
}

export type LumenFeedbackRequestStatus = 'shipped' | 'in-progress' | 'planned' | 'under-review'

export interface LumenFeedbackRequest {
  readonly id: string
  readonly title: string
  readonly status: LumenFeedbackRequestStatus
  readonly statusLabel: string
  readonly description: string
  readonly category: string
  readonly commentCount: number
  readonly voteCount: number
  readonly votedByDefault?: boolean | undefined
}

export interface LumenFeedbackFeatureBoardContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly newRequest: string
    readonly sortGroup: string
    readonly search: string
    readonly commentCount: (count: number) => string
    readonly voteFor: (title: string) => string
    readonly removeVote: (title: string) => string
    readonly empty: string
  }
  readonly sortOptions: readonly { readonly id: string; readonly label: string }[]
  readonly initialSortId: string
  readonly requests: readonly LumenFeedbackRequest[]
  readonly listStrategy: LumenFeedbackListStrategy
}

export interface LumenFeedbackInboxThread {
  readonly id: string
  readonly sender: string
  readonly initials: string
  readonly relativeTime: string
  readonly subject: string
  readonly account: string
  readonly channel: string
  readonly unread?: boolean | undefined
}

export interface LumenFeedbackInboxMetric {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface LumenFeedbackInboxDetail {
  readonly threadId: string
  readonly sentiment: string
  readonly sentimentTone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
  readonly body: string
  readonly tags: readonly string[]
  readonly metrics: readonly LumenFeedbackInboxMetric[]
  readonly related: readonly {
    readonly id: string
    readonly text: string
    readonly author: string
  }[]
}

export interface LumenFeedbackInboxContent {
  readonly labels: {
    readonly title: string
    readonly summary: string
    readonly archiveRead: string
    readonly detailLabel: string
    readonly addTag: string
    readonly internalNotePlaceholder: string
    readonly addInternalNote: string
    readonly reply: string
    readonly createIssue: string
    readonly archive: string
    readonly empty: string
    readonly openThread: (subject: string) => string
    readonly threadMeta: (account: string, channel: string, relativeTime: string) => string
  }
  readonly threads: readonly LumenFeedbackInboxThread[]
  readonly details: readonly LumenFeedbackInboxDetail[]
  readonly initialThreadId?: string | undefined
  readonly listStrategy: LumenFeedbackListStrategy
}

export interface LumenFeedbackMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail: string
}

export interface LumenFeedbackSentiment {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly percent: number
}

export interface LumenFeedbackTheme {
  readonly id: string
  readonly label: string
  readonly mentions: number
  readonly changeLabel: string
  readonly progress: number
}

export interface LumenFeedbackVolumePoint {
  readonly id: string
  readonly label: string
  readonly value: number
}

export interface LumenFeedbackInsightsContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly periodGroup: string
    readonly responsesPerDay: string
    readonly topThemes: string
    readonly mentionsPeriod: string
    readonly weeklyVolume: string
    readonly periodStart: string
    readonly periodEnd: string
    readonly sentiment: string
  }
  readonly periods: readonly { readonly id: string; readonly label: string }[]
  readonly initialPeriodId: string
  readonly metrics: readonly LumenFeedbackMetric[]
  readonly sentiment: readonly LumenFeedbackSentiment[]
  readonly themes: readonly LumenFeedbackTheme[]
  readonly volume: readonly LumenFeedbackVolumePoint[]
  readonly listStrategy: LumenFeedbackListStrategy
}

export interface LumenFeedbackContent {
  readonly referenceWidget?: LumenFeedbackWidgetReferenceContent | undefined
  readonly referenceSurvey?: LumenFeedbackSurveyReferenceContent | undefined
  readonly referenceRating?: LumenFeedbackRatingReferenceContent | undefined
  readonly referenceBoard?: LumenFeedbackBoardReferenceContent | undefined
  readonly referenceInbox?: LumenFeedbackInboxReferenceContent | undefined
  readonly referenceInsights?: LumenFeedbackInsightsReferenceContent | undefined
  readonly widget?: LumenFeedbackWidgetContent | undefined
  readonly survey?: LumenFeedbackSurveyContent | undefined
  readonly postResolution?: LumenFeedbackPostResolutionContent | undefined
  readonly featureBoard?: LumenFeedbackFeatureBoardContent | undefined
  readonly inbox?: LumenFeedbackInboxContent | undefined
  readonly insights?: LumenFeedbackInsightsContent | undefined
}

export interface LumenFeedbackProviderProps {
  readonly content: LumenFeedbackContent
  readonly children: React.ReactNode
}

export interface LumenFeedbackAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenFeedbackProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenFeedbackContent | undefined
  readonly onAction?: ((event: LumenFeedbackAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenFeedbackVariantProps = Omit<LumenFeedbackProps, 'variant' | 'variantId'>

const FeedbackContentContext = React.createContext<LumenFeedbackContent | undefined>(undefined)

export function LumenFeedbackProvider({ content, children }: LumenFeedbackProviderProps) {
  return <FeedbackContentContext.Provider value={content}>{children}</FeedbackContentContext.Provider>
}

export function useLumenFeedbackContent(): LumenFeedbackContent | undefined {
  return React.useContext(FeedbackContentContext)
}

export function uniqueLumenFeedbackItems<Item extends { readonly id: string }>(
  items: readonly Item[],
): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenFeedbackItem<Item extends { readonly id: string }>(
  items: readonly Item[],
  selectedId: string | undefined,
): Item | undefined {
  return items.find((item) => item.id === selectedId) ?? items[0]
}

const idleSubmission = { status: 'idle', error: null } as const

type WorkflowSubmission = {
  readonly status: 'idle' | 'submitting' | 'sent' | 'failed'
  readonly error: string | null
}

function report(onAction: LumenFeedbackProps['onAction'], actionId: string, value?: string) {
  onAction?.(value === undefined ? { actionId } : { actionId, value })
}

function CompatibilityMarker({
  className,
  strategy,
  children,
}: {
  readonly className: string
  readonly strategy?: LumenFeedbackListStrategy | undefined
  readonly children: React.ReactNode
}) {
  return (
    <div
      className={`lumen-feedback ${className}`}
      data-hbar-app-ui-list-strategy={strategy?.kind}
      data-hbar-app-ui-expected-maximum={strategy?.expectedMaximum}
    >
      {children}
    </div>
  )
}

function Widget({
  content,
  onAction,
}: {
  content: LumenFeedbackWidgetContent
  onAction: LumenFeedbackProps['onAction']
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(content.initialTypeId)
  const [text, setText] = React.useState('')
  const [attachmentName, setAttachmentName] = React.useState<string | null>(null)
  const [submission, setSubmission] = React.useState<WorkflowSubmission>(idleSubmission)
  return (
    <CompatibilityMarker className="lumen-feedback-widget">
      <FeedbackHeader
        title={content.labels.title}
        detail={content.labels.description}
        action={
          <LumenButton variant="text" onClick={() => report(onAction, 'close')}>
            {content.labels.close}
          </LumenButton>
        }
      />
      {submission.status === 'sent' ? (
        <div className="lumen-feedback-sent" role="status">
          <LumenStatus value={content.labels.sentTitle} tone="success" />
          <LumenText as="p" tone="muted">
            {content.labels.sentDescription(content.types.find((item) => item.id === selectedId)?.label ?? '')}
          </LumenText>
          <LumenButton
            variant="outlined"
            onClick={() => {
              setText('')
              setAttachmentName(null)
              setSubmission(idleSubmission)
            }}
          >
            {content.labels.sendAnother}
          </LumenButton>
        </div>
      ) : (
        <form
          className="lumen-feedback-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!selectedId || !text.trim()) {
              return
            }
            setSubmission({ status: 'sent', error: null })
            report(onAction, 'send', selectedId)
          }}
        >
          <div className="lumen-feedback-pills" role="group" aria-label={content.labels.typeGroup}>
            {content.types.map((type) => (
              <LumenButton
                key={type.id}
                variant={selectedId === type.id ? 'solid' : 'outlined'}
                aria-pressed={selectedId === type.id}
                onClick={() => {
                  setSelectedId(type.id)
                  report(onAction, 'change-type', type.id)
                }}
              >
                {type.label}
              </LumenButton>
            ))}
          </div>
          <label className="lumen-feedback-field">
            <LumenText as="span" variant="label">
              {content.labels.prompt}
            </LumenText>
            <LumenTextarea
              value={text}
              maxLength={content.maximumCharacters}
              placeholder={content.labels.promptPlaceholder}
              onChange={(event) => setText(event.currentTarget.value)}
            />
            <small>{content.labels.characterCount(text.length, content.maximumCharacters)}</small>
          </label>
          <div className="lumen-feedback-attachment">
            <LumenButton
              variant="outlined"
              onClick={() => {
                const next = attachmentName ? null : content.attachment.name
                setAttachmentName(next)
                report(onAction, 'attach', next ?? '')
              }}
            >
              {content.labels.attachment}
            </LumenButton>
            <span>{attachmentName ?? content.attachment.countLabel}</span>
          </div>
          <LumenText as="small" tone="muted">
            {content.labels.privacyNotice}
          </LumenText>
          <div className="lumen-feedback-actions">
            <LumenButton
              variant="text"
              onClick={() => {
                setText('')
                setAttachmentName(null)
              }}
            >
              {content.labels.cancel}
            </LumenButton>
            <LumenButton type="submit" tone="primary" disabled={!selectedId || !text.trim()}>
              {content.labels.send}
            </LumenButton>
          </div>
        </form>
      )}
    </CompatibilityMarker>
  )
}

function Survey({
  content,
  onAction,
}: {
  content: LumenFeedbackSurveyContent
  onAction: LumenFeedbackProps['onAction']
}) {
  const [score, setScore] = React.useState<number | null>(content.initialScore ?? null)
  const [reasonIds, setReasonIds] = React.useState<readonly string[]>([])
  const [comment, setComment] = React.useState('')
  const [submission, setSubmission] = React.useState<WorkflowSubmission>(idleSubmission)
  return (
    <CompatibilityMarker className="lumen-feedback-survey" strategy={content.listStrategy}>
      <FeedbackHeader title={content.labels.question} detail={content.labels.eyebrow} />
      {submission.status === 'sent' ? (
        <div className="lumen-feedback-sent" role="status">
          <LumenStatus value={content.labels.submitted} tone="success" />
        </div>
      ) : (
        <form
          className="lumen-feedback-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (score === null) {
              return
            }
            setSubmission({ status: 'sent', error: null })
            report(onAction, 'submit', String(score))
          }}
        >
          <div className="lumen-feedback-score" role="group" aria-label={content.labels.scoreGroup}>
            {content.scores.map((value) => (
              <LumenButton
                key={value}
                size="s"
                variant={score === value ? 'solid' : 'outlined'}
                aria-label={content.labels.scoreAccessible(value)}
                aria-pressed={score === value}
                onClick={() => {
                  setScore(value)
                  setReasonIds([])
                  report(onAction, 'select-score', String(value))
                }}
              >
                {value}
              </LumenButton>
            ))}
          </div>
          <div className="lumen-feedback-scale-labels">
            <span>{content.labels.scoreLow}</span>
            <span>{content.labels.scoreHigh}</span>
          </div>
          {score === null ? (
            <LumenText as="p" tone="muted">
              {content.labels.scorePrompt}
            </LumenText>
          ) : (
            <div className="lumen-feedback-followup">
              <LumenText as="strong" variant="label">
                {content.labels.reasonGroup}
              </LumenText>
              <div className="lumen-feedback-pills">
                {content.reasons.map((reason) => (
                  <LumenButton
                    key={reason.id}
                    variant={reasonIds.includes(reason.id) ? 'solid' : 'outlined'}
                    aria-pressed={reasonIds.includes(reason.id)}
                    onClick={() => {
                      setReasonIds((current) =>
                        current.includes(reason.id)
                          ? current.filter((id) => id !== reason.id)
                          : [...current, reason.id],
                      )
                      report(onAction, 'toggle-reason', reason.id)
                    }}
                  >
                    {reason.label}
                  </LumenButton>
                ))}
              </div>
              <LumenTextarea
                value={comment}
                placeholder={content.labels.commentPlaceholder}
                onChange={(event) => setComment(event.currentTarget.value)}
              />
            </div>
          )}
          <LumenText as="small" tone="muted">
            {content.labels.note}
          </LumenText>
          <div className="lumen-feedback-actions">
            <LumenButton variant="text" onClick={() => report(onAction, 'later')}>
              {content.labels.later}
            </LumenButton>
            <LumenButton type="submit" tone="primary" disabled={score === null}>
              {content.labels.submit}
            </LumenButton>
          </div>
        </form>
      )}
    </CompatibilityMarker>
  )
}

function PostResolution({
  content,
  onAction,
}: {
  content: LumenFeedbackPostResolutionContent
  onAction: LumenFeedbackProps['onAction']
}) {
  const [rating, setRating] = React.useState<number | null>(null)
  const [hoverRating, setHoverRating] = React.useState<number | null>(null)
  const [reasonId, setReasonId] = React.useState<string | null>(null)
  const [comment, setComment] = React.useState('')
  const [submission, setSubmission] = React.useState<WorkflowSubmission>(idleSubmission)
  return (
    <CompatibilityMarker className="lumen-feedback-rating" strategy={content.listStrategy}>
      <FeedbackHeader title={content.labels.question} detail={content.ticket.header} />
      <article className="lumen-feedback-ticket">
        <span className="lumen-feedback-avatar">{content.ticket.initials}</span>
        <div>
          <strong>{content.ticket.subject}</strong>
          <small>{content.ticket.detail}</small>
        </div>
        <LumenStatus value={content.ticket.ticketId} tone="neutral" />
      </article>
      {submission.status === 'sent' ? (
        <div className="lumen-feedback-sent" role="status">
          <LumenStatus value={content.labels.submitted} tone="success" />
        </div>
      ) : (
        <form
          className="lumen-feedback-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (rating === null) {
              return
            }
            setSubmission({ status: 'sent', error: null })
            report(onAction, 'submit', `${rating}:${reasonId ?? ''}`)
          }}
        >
          <div className="lumen-feedback-stars" role="group" aria-label={content.labels.ratingGroup}>
            {content.ratings.map((option) => {
              const active = option.value <= (hoverRating ?? rating ?? 0)
              return (
                <LumenIconButton
                  key={option.value}
                  label={option.label}
                  tone={active ? 'primary' : 'neutral'}
                  aria-pressed={rating === option.value}
                  onMouseEnter={() => setHoverRating(option.value)}
                  onMouseLeave={() => setHoverRating(null)}
                  onClick={() => {
                    setRating(option.value)
                    setReasonId(null)
                    report(onAction, 'select-rating', String(option.value))
                  }}
                >
                  <FeedbackGlyph name="star" />
                </LumenIconButton>
              )
            })}
          </div>
          {rating !== null ? (
            <div className="lumen-feedback-followup">
              <LumenText as="strong" variant="label">
                {content.labels.reasonGroup}
              </LumenText>
              <div className="lumen-feedback-pills">
                {content.reasons.map((reason) => (
                  <LumenButton
                    key={reason.id}
                    variant={reasonId === reason.id ? 'solid' : 'outlined'}
                    aria-pressed={reasonId === reason.id}
                    onClick={() => {
                      setReasonId(reason.id)
                      report(onAction, 'select-reason', reason.id)
                    }}
                  >
                    {reason.label}
                  </LumenButton>
                ))}
              </div>
              <LumenTextarea
                value={comment}
                placeholder={content.labels.commentPlaceholder}
                onChange={(event) => setComment(event.currentTarget.value)}
              />
            </div>
          ) : null}
          <div className="lumen-feedback-actions">
            <LumenButton variant="text" onClick={() => report(onAction, 'no-thanks')}>
              {content.labels.noThanks}
            </LumenButton>
            <LumenButton type="submit" tone="primary" disabled={rating === null}>
              {content.labels.submit}
            </LumenButton>
          </div>
        </form>
      )}
    </CompatibilityMarker>
  )
}

function FeatureBoard({
  content,
  onAction,
}: {
  content: LumenFeedbackFeatureBoardContent
  onAction: LumenFeedbackProps['onAction']
}) {
  const [sortId, setSortId] = React.useState(content.initialSortId)
  const [query, setQuery] = React.useState('')
  const [votedIds, setVotedIds] = React.useState<readonly string[]>(
    content.requests.filter((item) => item.votedByDefault).map((item) => item.id),
  )
  return (
    <CompatibilityMarker className="hbar-app-ui-feedback-request-list" strategy={content.listStrategy}>
      <HbarAppUiFeedback04
        copy={{
          title: content.labels.title,
          detail: content.labels.description,
          empty: content.labels.empty,
          newRequest: content.labels.newRequest,
          sort: content.labels.sortGroup,
          search: content.labels.search,
          vote: content.labels.voteFor,
          removeVote: content.labels.removeVote,
          comments: content.labels.commentCount,
        }}
        content={{
          boardId: 'feedback-board',
          sortOptions: content.sortOptions,
          requests: uniqueLumenFeedbackItems(content.requests).map((request) => ({
            id: request.id,
            title: request.title,
            description: request.description,
            status: request.statusLabel,
            tone: request.status === 'shipped' ? 'success' : request.status === 'in-progress' ? 'warning' : 'neutral',
            category: request.category,
            votes: request.voteCount + (votedIds.includes(request.id) && !request.votedByDefault ? 1 : 0),
            comments: request.commentCount,
            voted: votedIds.includes(request.id),
          })),
        }}
        state={{ sortId, query, busyIds: [] }}
        actions={{
          onSortChange: (_id, value) => setSortId(value),
          onQueryChange: (_id, value) => setQuery(value),
          onVote: (_id, value) => {
            setVotedIds((current) =>
              current.includes(value) ? current.filter((id) => id !== value) : [...current, value],
            )
            report(onAction, 'vote', value)
          },
          onNewRequest: () => report(onAction, 'new-request'),
        }}
      />
    </CompatibilityMarker>
  )
}

function Inbox({
  content,
  onAction,
}: {
  content: LumenFeedbackInboxContent
  onAction: LumenFeedbackProps['onAction']
}) {
  const threads = uniqueLumenFeedbackItems(content.threads)
  const [selectedId, setSelectedId] = React.useState<string | null>(content.initialThreadId ?? threads[0]?.id ?? null)
  const [note, setNote] = React.useState('')
  const [tagDraft, setTagDraft] = React.useState('')
  const [addedTags, setAddedTags] = React.useState<readonly string[]>([])
  const selectedThread = threads.find((thread) => thread.id === selectedId) ?? threads[0]
  const detail = content.details.find((item) => item.threadId === selectedThread?.id)
  return (
    <CompatibilityMarker className="lumen-feedback-inbox" strategy={content.listStrategy}>
      <FeedbackHeader
        title={content.labels.title}
        detail={content.labels.summary}
        action={
          <LumenButton variant="outlined" onClick={() => report(onAction, 'archive-read')}>
            {content.labels.archiveRead}
          </LumenButton>
        }
      />
      <div className="lumen-feedback-inbox-layout">
        <div className="lumen-feedback-thread-list">
          {threads.map((thread) => (
            <LumenButton
              key={thread.id}
              variant={selectedThread?.id === thread.id ? 'solid' : 'text'}
              aria-label={content.labels.openThread(thread.subject)}
              onClick={() => {
                setSelectedId(thread.id)
                setNote('')
                setTagDraft('')
                setAddedTags([])
                report(onAction, 'open-thread', thread.id)
              }}
            >
              <span className="lumen-feedback-avatar">{thread.initials}</span>
              <span>
                <strong>{thread.subject}</strong>
                <small>{content.labels.threadMeta(thread.account, thread.channel, thread.relativeTime)}</small>
              </span>
              {thread.unread ? <i aria-hidden="true" /> : null}
            </LumenButton>
          ))}
        </div>
        {selectedThread && detail ? (
          <article className="lumen-feedback-thread-detail" aria-label={content.labels.detailLabel}>
            <header>
              <div>
                <strong>{selectedThread.sender}</strong>
                <small>{selectedThread.subject}</small>
              </div>
              <LumenStatus value={detail.sentiment} tone={detail.sentimentTone} />
            </header>
            <p>{detail.body}</p>
            <div className="lumen-feedback-pills">
              {[...detail.tags, ...addedTags].map((tag) => (
                <LumenChip key={tag} label={tag} startAdornment={<FeedbackGlyph name="tag" />} />
              ))}
            </div>
            <div className="lumen-feedback-tag-editor">
              <LumenInput
                value={tagDraft}
                aria-label={content.labels.addTag}
                placeholder={content.labels.addTag}
                onChange={(event) => setTagDraft(event.currentTarget.value)}
              />
              <LumenButton
                variant="outlined"
                disabled={!tagDraft.trim()}
                onClick={() => {
                  const tag = tagDraft.trim()
                  if (!tag || detail.tags.includes(tag) || addedTags.includes(tag)) {
                    return
                  }
                  setAddedTags((current) => [...current, tag])
                  setTagDraft('')
                  report(onAction, 'add-tag', tag)
                }}
              >
                {content.labels.addTag}
              </LumenButton>
            </div>
            <dl className="lumen-feedback-metrics">
              {detail.metrics.map((metric) => (
                <div key={metric.id}>
                  <dt>{metric.label}</dt>
                  <dd>{metric.value}</dd>
                </div>
              ))}
            </dl>
            <LumenTextarea
              value={note}
              placeholder={content.labels.internalNotePlaceholder}
              onChange={(event) => setNote(event.currentTarget.value)}
            />
            <div className="lumen-feedback-actions">
              <LumenButton
                variant="text"
                disabled={!note.trim()}
                onClick={() => {
                  report(onAction, 'add-note', selectedThread.id)
                  setNote('')
                }}
              >
                {content.labels.addInternalNote}
              </LumenButton>
              <LumenButton variant="text" onClick={() => report(onAction, 'create-issue', selectedThread.id)}>
                {content.labels.createIssue}
              </LumenButton>
              <LumenButton variant="outlined" onClick={() => report(onAction, 'archive', selectedThread.id)}>
                {content.labels.archive}
              </LumenButton>
              <LumenButton tone="primary" onClick={() => report(onAction, 'reply', selectedThread.id)}>
                {content.labels.reply}
              </LumenButton>
            </div>
          </article>
        ) : (
          <LumenText as="p" tone="muted">
            {content.labels.empty}
          </LumenText>
        )}
      </div>
    </CompatibilityMarker>
  )
}

function Insights({
  content,
  onAction,
}: {
  content: LumenFeedbackInsightsContent
  onAction: LumenFeedbackProps['onAction']
}) {
  const [periodId, setPeriodId] = React.useState(content.initialPeriodId)
  return (
    <CompatibilityMarker className="lumen-feedback-insights" strategy={content.listStrategy}>
      <FeedbackHeader title={content.labels.title} detail={content.labels.description} />
      <LumenTabs
        className="lumen-feedback-tabs"
        label={content.labels.periodGroup}
        items={content.periods}
        selectedId={periodId}
        onChange={(id) => {
          setPeriodId(id)
          report(onAction, 'change-period', id)
        }}
      />
      <dl className="lumen-feedback-metrics">
        {content.metrics.map((metric) => (
          <div key={metric.id}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            <small>{metric.detail}</small>
          </div>
        ))}
      </dl>
      <div className="lumen-feedback-insight-columns">
        <section aria-label={content.labels.sentiment}>
          <LumenText as="h3" variant="label">
            {content.labels.sentiment}
          </LumenText>
          {content.sentiment.map((sentiment) => (
            <div className="lumen-feedback-insight-row" key={sentiment.id}>
              <span>{sentiment.label}</span>
              <b>{sentiment.value}</b>
              <FeedbackProgress value={sentiment.percent} label={sentiment.label} />
            </div>
          ))}
        </section>
        <section aria-label={content.labels.topThemes}>
          <LumenText as="h3" variant="label">
            {content.labels.topThemes}
          </LumenText>
          {content.themes.map((theme) => (
            <div className="lumen-feedback-insight-row" key={theme.id}>
              <span>{theme.label}</span>
              <b>{[theme.mentions, theme.changeLabel].join(' · ')}</b>
              <FeedbackProgress value={theme.progress} label={theme.label} />
            </div>
          ))}
        </section>
      </div>
      <LumenChart
        kind="bar"
        label={content.labels.weeklyVolume}
        series={[
          {
            id: 'responses',
            label: content.labels.responsesPerDay,
            tone: 'info',
            points: content.volume.map((point) => ({
              id: point.id,
              label: point.label,
              value: point.value,
            })),
          },
        ]}
        empty={content.labels.responsesPerDay}
      />
      <div className="lumen-feedback-period-caption">
        <span>{content.labels.periodStart}</span>
        <span>{content.labels.periodEnd}</span>
      </div>
    </CompatibilityMarker>
  )
}

function FeedbackRoot({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  boundary = 'horizontal',
  children,
}: Omit<LumenFeedbackProps, 'content' | 'onAction'> & {
  readonly children: React.ReactNode
  readonly boundary?: 'horizontal' | 'none'
}) {
  const contentClassName = [
    'lumen-feedback-workflow',
    'hbar-app-ui-feedback-surface',
    `hbar-app-ui-feedback-variant-${variant}`,
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as="section"
      boundary={boundary}
      className="lumen-feedback-workflow-surface"
      contentClassName={contentClassName}
      data-lumen-component="feedback"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-surface={surface}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

export function LumenFeedback(props: LumenFeedbackProps) {
  const providerContent = useLumenFeedbackContent()
  const content = props.content ?? providerContent
  let view: React.ReactNode = null
  if (props.variant === 1 && content?.referenceWidget)
    return (
      <FeedbackRoot
        {...props}
        boundary="none"
        className={[
          props.className,
          'lumen-feedback-widget-reference',
          'hbar-app-ui-stage-padding-owner',
          'hbar-app-ui-full-canvas-owner',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenFeedbackWidgetReference content={content.referenceWidget} onAction={props.onAction} />
      </FeedbackRoot>
    )
  if (props.variant === 1 && content?.widget) view = <Widget content={content.widget} onAction={props.onAction} />
  if (props.variant === 2 && content?.referenceSurvey)
    return (
      <FeedbackRoot
        {...props}
        boundary="none"
        className={[
          props.className,
          'lumen-feedback-survey-reference',
          'hbar-app-ui-full-canvas-owner',
          'hbar-app-ui-stage-padding-owner',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenFeedbackSurveyReference content={content.referenceSurvey} onAction={props.onAction} />
      </FeedbackRoot>
    )
  if (props.variant === 2 && content?.survey) view = <Survey content={content.survey} onAction={props.onAction} />
  if (props.variant === 3 && content?.referenceRating)
    return (
      <FeedbackRoot
        {...props}
        boundary="none"
        className={[
          props.className,
          'lumen-feedback-rating-reference',
          'hbar-app-ui-full-canvas-owner',
          'hbar-app-ui-stage-padding-owner',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenFeedbackRatingReference content={content.referenceRating} onAction={props.onAction} />
      </FeedbackRoot>
    )
  if (props.variant === 3 && content?.postResolution)
    view = <PostResolution content={content.postResolution} onAction={props.onAction} />
  if (props.variant === 4 && content?.referenceBoard)
    return (
      <FeedbackRoot
        {...props}
        boundary="none"
        className={[
          props.className,
          'lumen-feedback-board-reference',
          'hbar-app-ui-full-canvas-owner',
          'hbar-app-ui-stage-padding-owner',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenFeedbackBoardReference content={content.referenceBoard} onAction={props.onAction} />
      </FeedbackRoot>
    )
  if (props.variant === 4 && content?.featureBoard)
    view = <FeatureBoard content={content.featureBoard} onAction={props.onAction} />
  if (props.variant === 5 && content?.referenceInbox)
    return (
      <FeedbackRoot
        {...props}
        boundary="none"
        className={[
          props.className,
          'lumen-feedback-inbox-reference',
          'hbar-app-ui-full-canvas-owner',
          'hbar-app-ui-stage-padding-owner',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenFeedbackInboxReference content={content.referenceInbox} onAction={props.onAction} />
      </FeedbackRoot>
    )
  if (props.variant === 5 && content?.inbox) view = <Inbox content={content.inbox} onAction={props.onAction} />
  if (props.variant === 6 && content?.referenceInsights)
    return (
      <FeedbackRoot
        {...props}
        boundary="none"
        className={[
          props.className,
          'lumen-feedback-insights-reference',
          'hbar-app-ui-full-canvas-owner',
          'hbar-app-ui-stage-padding-owner',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenFeedbackInsightsReference content={content.referenceInsights} onAction={props.onAction} />
      </FeedbackRoot>
    )
  if (props.variant === 6 && content?.insights) view = <Insights content={content.insights} onAction={props.onAction} />
  return <FeedbackRoot {...props}>{view}</FeedbackRoot>
}

function createFeedbackVariant(variant: number) {
  function Component(props: LumenFeedbackVariantProps) {
    return <LumenFeedback {...props} variant={variant} variantId={`hbar-app-ui-feedback-${variant}`} />
  }
  Component.displayName = `LumenFeedback${String(variant).padStart(2, '0')}`
  return Component
}

export const LumenFeedback01 = createFeedbackVariant(1)

export const LumenFeedback02 = createFeedbackVariant(2)

export const LumenFeedback03 = createFeedbackVariant(3)

export const LumenFeedback04 = createFeedbackVariant(4)

export const LumenFeedback05 = createFeedbackVariant(5)

export const LumenFeedback06 = createFeedbackVariant(6)

function FeedbackGlyph({ name }: { name: 'close' | 'star' | 'vote' | 'tag' }) {
  return (
    <svg className="lumen-feedback-glyph" viewBox="0 0 16 16" aria-hidden="true">
      {name === 'close' ? <path d="m4 4 8 8m0-8-8 8" /> : null}
      {name === 'star' ? <path d="m8 2 1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z" /> : null}
      {name === 'vote' ? <path d="M8 13V3m0 0L4 7m4-4 4 4" /> : null}
      {name === 'tag' ? <path d="M3 3h5l5 5-5 5-5-5Zm3 3h.01" /> : null}
    </svg>
  )
}

function FeedbackHeader({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <header className="lumen-feedback-header">
      <div>
        <LumenText as="h2" variant="heading">
          {title}
        </LumenText>
        <LumenText as="p" tone="muted" variant="supporting">
          {detail}
        </LumenText>
      </div>
      {action}
    </header>
  )
}

function FeedbackProgress({ value, label }: { value: number; label: string }) {
  return <LumenProgress className="lumen-feedback-progress" label={label} value={value} tone="info" />
}
