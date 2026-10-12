'use client'

import * as React from 'react'
import LumenField from '../LumenField'
import LumenIndicator from '../LumenIndicator'
import LumenSurface from '../LumenSurface'
import { LumenFormField, LumenInput, LumenTextarea, LumenFileButton } from '../forms'
import { LumenButton } from '../primitives'
import {
  type FeedbackActionCopy,
  type FeedbackBaseCopy,
  type FeedbackOption,
  type FeedbackSubmission,
  type HbarAppUiFeedback01Props,
  type HbarAppUiFeedback02Props,
  type HbarAppUiFeedback03Props,
  type HbarAppUiFeedback04Props,
  type HbarAppUiFeedback05Props,
  type HbarAppUiFeedback06Props,
} from './feedbackTypes'
import styles from './feedback.module.css'
import { LumenProgress } from '../ui-controls'

export type {
  HbarAppUiFeedback01Props,
  HbarAppUiFeedback02Props,
  HbarAppUiFeedback03Props,
  HbarAppUiFeedback04Props,
  HbarAppUiFeedback05Props,
  HbarAppUiFeedback06Props,
} from './feedbackTypes'

function uniqueItems<Item extends { id: string }>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter(({ id }) => {
    if (seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}

function Frame({
  id,
  copy,
  state = 'selected',
  tone = 'neutral',
  children,
}: {
  id: string
  copy: FeedbackBaseCopy
  state?: 'selected' | 'running' | 'failed' | undefined
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | undefined
  children: React.ReactNode
}) {
  return (
    <LumenSurface className={styles.surface} data-hbar-app-ui-variant={id}>
      <section className={styles.frame} aria-labelledby={`${id}-title`}>
        <header className={styles.header}>
          <div>
            <h2 id={`${id}-title`}>{copy.title}</h2>
            <p>{copy.detail}</p>
          </div>
          <LumenIndicator edge="left" state={state} tone={tone} />
        </header>
        {children}
      </section>
    </LumenSurface>
  )
}

function Action({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean | undefined
}) {
  return (
    <LumenButton
      className={styles.action}
      variant="outlined"
      indicatorState={disabled ? 'disabled' : 'idle'}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </LumenButton>
  )
}

function Choices({
  label,
  items,
  selectedId,
  selectedIds,
  onSelect,
  disabled = false,
}: {
  label: string
  items: readonly FeedbackOption[]
  selectedId: string | null
  selectedIds?: readonly string[] | undefined
  onSelect: (id: string) => void
  disabled?: boolean | undefined
}) {
  return (
    <div className={styles.choices} role="group" aria-label={label}>
      {uniqueItems(items).map((item) => (
        <LumenButton
          key={item.id}
          className={styles.choice}
          variant="outlined"
          indicatorState={selectedId === item.id || Boolean(selectedIds?.includes(item.id)) ? 'selected' : 'idle'}
          aria-pressed={selectedId === item.id || Boolean(selectedIds?.includes(item.id))}
          disabled={disabled}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </LumenButton>
      ))}
    </div>
  )
}

function Submission({
  copy,
  state,
  reset,
}: {
  copy: FeedbackActionCopy
  state: FeedbackSubmission
  reset: () => void
}) {
  if (state.status === 'sent') {
    return (
      <div className={styles.result} role="status">
        <LumenIndicator edge="left" tone="success" state="selected" />
        <span>{copy.sent}</span>
        <Action onClick={reset}>{copy.reset}</Action>
      </div>
    )
  }
  return state.error ? (
    <p className={styles.error} role="alert">
      {state.error}
    </p>
  ) : null
}

function submitLabel(copy: FeedbackActionCopy, status: FeedbackSubmission['status']) {
  if (status === 'submitting') {
    return copy.submitting
  }
  if (status === 'failed') {
    return copy.retry
  }
  return copy.submit
}

function frameStatus(submission: FeedbackSubmission) {
  if (submission.status === 'submitting') {
    return { state: 'running', tone: 'info' } as const
  }
  if (submission.status === 'failed') {
    return { state: 'failed', tone: 'danger' } as const
  }
  if (submission.status === 'sent') {
    return { state: 'selected', tone: 'success' } as const
  }
  return { state: 'selected', tone: 'neutral' } as const
}

export function HbarAppUiFeedback01({ copy, content, state, actions }: HbarAppUiFeedback01Props) {
  const selected = content.types.find((item) => item.id === state.selectedId)
  const busy = state.submission.status === 'submitting'
  return (
    <Frame id="hbar-app-ui-feedback-1" copy={copy} {...frameStatus(state.submission)}>
      {state.submission.status === 'sent' ? (
        <Submission copy={copy} state={state.submission} reset={() => actions.onReset(content.id)} />
      ) : (
        <div className={styles.stack}>
          <Choices
            label={copy.typeLabel}
            items={content.types}
            selectedId={selected?.id ?? null}
            onSelect={(id) => actions.onTypeChange(content.id, id)}
            disabled={busy}
          />
          {content.types.length === 0 && <p>{copy.empty}</p>}
          <LumenField boundary="horizontal">
            <LumenFormField controlId={`${content.id}-message`} label={copy.messageLabel}>
              <LumenTextarea
                rows={4}
                value={state.text}
                placeholder={copy.messagePlaceholder}
                disabled={busy}
                onChange={(event) => actions.onTextChange(content.id, event.target.value)}
              />
            </LumenFormField>
          </LumenField>
          <div className={styles.row}>
            <LumenFileButton
              className={styles.attachment}
              label={copy.attachment}
              variant="outlined"
              indicatorState={busy ? 'disabled' : 'idle'}
              disabled={busy}
              onFiles={(files) => {
                const file = files[0]
                if (file) {
                  actions.onAttach(content.id, file)
                }
              }}
            />
            {content.attachmentName && <span>{content.attachmentName}</span>}
          </div>
          <Submission copy={copy} state={state.submission} reset={() => actions.onReset(content.id)} />
          <div className={styles.actions}>
            <Action onClick={() => actions.onClose(content.id)}>{copy.close}</Action>
            <Action
              disabled={!state.text.trim() || !selected || busy}
              onClick={() => {
                if (selected) {
                  actions.onSubmit(content.id, selected.id, state.text)
                }
              }}
            >
              {submitLabel(copy, state.submission.status)}
            </Action>
          </div>
        </div>
      )}
    </Frame>
  )
}

export function HbarAppUiFeedback02({ copy, content, state, actions }: HbarAppUiFeedback02Props) {
  const busy = state.submission.status === 'submitting'
  const scoreValid = state.score !== null && content.scores.includes(state.score)
  return (
    <Frame id="hbar-app-ui-feedback-2" copy={copy} {...frameStatus(state.submission)}>
      {state.submission.status === 'sent' ? (
        <Submission copy={copy} state={state.submission} reset={() => actions.onReset(content.id)} />
      ) : (
        <div className={styles.stack}>
          <div className={styles.stack}>
            <strong>{copy.scale}</strong>
            <div className={styles.scale} role="group" aria-label={copy.scale}>
              {[...new Set(content.scores)].map((score) => (
                <LumenButton
                  key={score}
                  className={styles.scaleButton}
                  aria-label={copy.scoreLabel(score)}
                  aria-pressed={state.score === score}
                  disabled={busy}
                  onClick={() => actions.onScoreChange(content.id, score)}
                >
                  {score}
                  <LumenIndicator edge="bottom" state={state.score === score ? 'selected' : 'idle'} />
                </LumenButton>
              ))}
            </div>
            {content.scores.length === 0 && <p>{copy.empty}</p>}
            <div className={styles.row}>
              <small>{copy.low}</small>
              <small>{copy.high}</small>
            </div>
          </div>
          <Choices
            label={copy.reasons}
            items={content.reasons}
            selectedId={null}
            selectedIds={state.reasonIds}
            onSelect={(id) => actions.onReasonToggle(content.id, id)}
            disabled={busy || !scoreValid}
          />
          <LumenField boundary="horizontal">
            <LumenFormField controlId={`${content.id}-comment`} label={copy.comment}>
              <LumenTextarea
                rows={3}
                value={state.comment}
                disabled={busy}
                onChange={(event) => actions.onCommentChange(content.id, event.target.value)}
              />
            </LumenFormField>
          </LumenField>
          <Submission copy={copy} state={state.submission} reset={() => actions.onReset(content.id)} />
          <div className={styles.actions}>
            <Action onClick={() => actions.onLater(content.id)}>{copy.later}</Action>
            <Action
              disabled={!scoreValid || busy}
              onClick={() => {
                if (scoreValid && state.score !== null) {
                  actions.onSubmit(content.id, state.score, state.reasonIds, state.comment)
                }
              }}
            >
              {submitLabel(copy, state.submission.status)}
            </Action>
          </div>
        </div>
      )}
    </Frame>
  )
}

export function HbarAppUiFeedback03({ copy, content, state, actions }: HbarAppUiFeedback03Props) {
  const busy = state.submission.status === 'submitting'
  const ratingValid = state.rating !== null && content.ratings.some(({ value }) => value === state.rating)
  return (
    <Frame id="hbar-app-ui-feedback-3" copy={copy} {...frameStatus(state.submission)}>
      <p className={styles.ticket}>{content.ticket}</p>
      {state.submission.status === 'sent' ? (
        <Submission copy={copy} state={state.submission} reset={() => actions.onReset(content.id)} />
      ) : (
        <div className={styles.stack}>
          <div className={styles.stack}>
            <strong>{copy.rating}</strong>
            <div className={styles.choices} role="group" aria-label={copy.rating}>
              {content.ratings.map(({ value, label }) => (
                <LumenButton
                  key={value}
                  className={styles.choice}
                  aria-label={label}
                  aria-pressed={state.rating === value}
                  disabled={busy}
                  onClick={() => actions.onRatingChange(content.id, value)}
                >
                  {value}
                  <LumenIndicator edge="bottom" state={state.rating === value ? 'selected' : 'idle'} />
                </LumenButton>
              ))}
            </div>
            {content.ratings.length === 0 && <p>{copy.empty}</p>}
          </div>
          <Choices
            label={copy.reasons}
            items={content.reasons}
            selectedId={state.reasonId}
            disabled={!ratingValid || busy}
            onSelect={(id) => actions.onReasonChange(content.id, id)}
          />
          <LumenField boundary="horizontal">
            <LumenFormField controlId={`${content.id}-comment`} label={copy.comment}>
              <LumenTextarea
                rows={3}
                value={state.comment}
                disabled={busy}
                onChange={(event) => actions.onCommentChange(content.id, event.target.value)}
              />
            </LumenFormField>
          </LumenField>
          <Submission copy={copy} state={state.submission} reset={() => actions.onReset(content.id)} />
          <div className={styles.actions}>
            <Action onClick={() => actions.onSkip(content.id)}>{copy.skip}</Action>
            <Action
              disabled={!ratingValid || busy}
              onClick={() => {
                if (ratingValid && state.rating !== null) {
                  actions.onSubmit(content.id, state.rating, state.reasonId, state.comment)
                }
              }}
            >
              {submitLabel(copy, state.submission.status)}
            </Action>
          </div>
        </div>
      )}
    </Frame>
  )
}

export function HbarAppUiFeedback04({ copy, content, state, actions }: HbarAppUiFeedback04Props) {
  const requests = uniqueItems(content.requests).filter((request) =>
    request.title.toLocaleLowerCase().includes(state.query.toLocaleLowerCase().trim()),
  )
  return (
    <Frame id="hbar-app-ui-feedback-4" copy={copy}>
      <div className={styles.toolbar}>
        <Choices
          label={copy.sort}
          items={content.sortOptions}
          selectedId={state.sortId}
          onSelect={(id) => actions.onSortChange(content.boardId, id)}
        />
        <Action onClick={() => actions.onNewRequest(content.boardId)}>{copy.newRequest}</Action>
      </div>
      <LumenField boundary="horizontal">
        <LumenFormField controlId={`${content.boardId}-search`} label={copy.search}>
          <LumenInput
            type="text"
            inputMode="search"
            value={state.query}
            onChange={(event) => actions.onQueryChange(content.boardId, event.target.value)}
          />
        </LumenFormField>
      </LumenField>
      <div className={styles.scrollList} aria-label={copy.title}>
        {requests.length === 0 && <p>{copy.empty}</p>}
        {requests.map((request) => (
          <article className={styles.request} key={request.id}>
            <LumenButton
              className={styles.vote}
              aria-pressed={request.voted}
              aria-label={request.voted ? copy.removeVote(request.title) : copy.vote(request.title)}
              disabled={state.busyIds.includes(request.id)}
              onClick={() => actions.onVote(content.boardId, request.id)}
            >
              {request.votes}
            </LumenButton>
            <div className={styles.requestBody}>
              <div className={styles.row}>
                <h3>{request.title}</h3>
                <span className={styles.status} data-tone={request.tone}>
                  {request.status}
                </span>
              </div>
              <p>{request.description}</p>
              <div className={styles.row}>
                <small>{request.category}</small>
                <small>{copy.comments(request.comments)}</small>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Frame>
  )
}

export function HbarAppUiFeedback05({ copy, content, state, actions }: HbarAppUiFeedback05Props) {
  const threads = uniqueItems(content.threads)
  const selected = threads.find((thread) => thread.id === state.selectedId) ?? threads[0]
  return (
    <Frame id="hbar-app-ui-feedback-5" copy={copy}>
      <div className={styles.inbox}>
        <nav className={styles.threadList} aria-label={copy.threads}>
          {threads.length === 0 && <p>{copy.empty}</p>}
          {threads.map((thread) => (
            <LumenButton
              key={thread.id}
              className={styles.thread}
              aria-current={thread.id === selected?.id ? 'page' : undefined}
              onClick={() => actions.onSelect(content.inboxId, thread.id)}
            >
              <span className={styles.threadCopy}>
                <span>
                  <strong>{thread.sender}</strong>
                  <small>{thread.metadata}</small>
                </span>
                <span>{thread.subject}</span>
              </span>
              <LumenIndicator
                edge="right"
                state={thread.id === selected?.id ? 'selected' : 'idle'}
                tone={thread.unread ? 'info' : 'neutral'}
              />
            </LumenButton>
          ))}
        </nav>
        {selected && (
          <section className={styles.threadDetail} aria-label={copy.detailLabel}>
            <div className={styles.row}>
              <h3>{selected.subject}</h3>
              <span className={styles.status} data-tone={selected.tone}>
                {selected.sentiment}
              </span>
            </div>
            <p>{selected.body}</p>
            <div className={styles.choices}>
              {uniqueItems(selected.tags).map((tag) => (
                <span className={styles.status} key={tag.id}>
                  {tag.label}
                </span>
              ))}
              <Action onClick={() => actions.onAddTag(selected.id)}>{copy.addTag}</Action>
            </div>
            <LumenField boundary="horizontal">
              <LumenFormField controlId={`${selected.id}-note`} label={copy.note}>
                <LumenTextarea
                  rows={3}
                  value={state.note}
                  onChange={(event) => actions.onNoteChange(selected.id, event.target.value)}
                />
              </LumenFormField>
            </LumenField>
            {state.error && (
              <p role="alert" className={styles.error}>
                {state.error}
              </p>
            )}
            <div className={styles.actions}>
              <Action
                disabled={state.busyId === selected.id || !state.note.trim()}
                onClick={() => actions.onReply(selected.id, state.note)}
              >
                {copy.reply}
              </Action>
              <Action disabled={state.busyId === selected.id} onClick={() => actions.onArchive(selected.id)}>
                {state.busyId === selected.id ? copy.archiving : copy.archive}
              </Action>
            </div>
          </section>
        )}
      </div>
    </Frame>
  )
}

function InsightRows({
  title,
  rows,
}: {
  title: string
  rows: readonly { id: string; label: string; value: string; percent: number }[]
}) {
  return (
    <section className={styles.insightRows} aria-label={title}>
      <h3>{title}</h3>
      {uniqueItems(rows).map((row) => (
        <div className={styles.insightRow} key={row.id}>
          <div className={styles.row}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
          <LumenProgress label={row.label} value={row.percent} />
        </div>
      ))}
    </section>
  )
}

export function HbarAppUiFeedback06({ copy, content, state, actions }: HbarAppUiFeedback06Props) {
  let indicatorState: 'selected' | 'running' | 'failed' = 'selected'
  let tone: 'neutral' | 'info' | 'danger' = 'neutral'
  if (state.loading) {
    indicatorState = 'running'
    tone = 'info'
  } else if (state.error) {
    indicatorState = 'failed'
    tone = 'danger'
  }
  return (
    <Frame id="hbar-app-ui-feedback-6" copy={copy} state={indicatorState} tone={tone}>
      <Choices
        label={copy.period}
        items={content.periods}
        selectedId={state.periodId}
        disabled={state.loading}
        onSelect={(id) => actions.onPeriodChange(content.reportId, id)}
      />
      {state.error && (
        <div className={styles.actions}>
          <p role="alert" className={styles.error}>
            {state.error}
          </p>
          <Action onClick={() => actions.onRetry(content.reportId)}>{copy.retry}</Action>
        </div>
      )}
      {!state.error && (
        <React.Fragment>
          {content.metrics.length === 0 &&
            content.sentiment.length === 0 &&
            content.themes.length === 0 &&
            content.volume.length === 0 && <p>{copy.empty}</p>}
          <div className={styles.metrics}>
            {uniqueItems(content.metrics).map((metric) => (
              <article key={metric.id}>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </article>
            ))}
          </div>
          <div className={styles.insights}>
            <InsightRows title={copy.sentiment} rows={content.sentiment} />
            <InsightRows title={copy.themes} rows={content.themes} />
            <InsightRows title={copy.volume} rows={content.volume} />
          </div>
        </React.Fragment>
      )}
    </Frame>
  )
}
