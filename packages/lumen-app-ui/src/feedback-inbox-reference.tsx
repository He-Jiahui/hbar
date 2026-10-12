'use client'

import * as React from 'react'
import { Archive, ArrowUpRight, Globe2, Mail, MessageSquare, Tag } from 'lucide-react'
import type { LumenFeedbackAction, LumenFeedbackListStrategy } from './feedback-workflows'
import './feedback-inbox-reference.css'

export interface LumenFeedbackInboxReferenceThread {
  readonly id: string
  readonly sender: string
  readonly initials: string
  readonly relativeTime: string
  readonly subject: string
  readonly account: string
  readonly channel: 'web' | 'email' | 'chat'
  readonly unread: boolean
}

export interface LumenFeedbackInboxReferenceDetail {
  readonly threadId: string
  readonly sentiment: string
  readonly meta: string
  readonly body: string
  readonly tags: readonly { readonly id: string; readonly label: string }[]
  readonly metrics: readonly { readonly id: string; readonly label: string; readonly value: string }[]
  readonly related: readonly { readonly id: string; readonly text: string; readonly author: string }[]
}

export interface LumenFeedbackInboxReferenceContent {
  readonly inboxId: string
  readonly labels: {
    readonly title: string
    readonly summary: string
    readonly archiveRead: string
    readonly unread: string
    readonly addTag: string
    readonly related: string
    readonly note: string
    readonly notePlaceholder: string
    readonly reply: string
    readonly createIssue: string
    readonly archive: string
    readonly emptyThreads: string
    readonly emptyDetail: string
    readonly openThread: (sender: string, time: string, subject: string, account: string, unread: boolean) => string
  }
  readonly threads: readonly LumenFeedbackInboxReferenceThread[]
  readonly details: readonly LumenFeedbackInboxReferenceDetail[]
  readonly selectedThreadId: string | undefined
  readonly noteDraft: string
  readonly listStrategy: LumenFeedbackListStrategy
  readonly detailStrategy: LumenFeedbackListStrategy
  readonly onSelectThread?: ((inboxId: string, threadId: string) => void) | undefined
  readonly onNoteChange?: ((inboxId: string, draft: string) => void) | undefined
  readonly onArchiveRead?: ((inboxId: string) => void) | undefined
  readonly onAddTag?: ((inboxId: string, threadId: string) => void) | undefined
  readonly onReply?: ((inboxId: string, threadId: string) => void) | undefined
  readonly onCreateIssue?: ((inboxId: string, threadId: string) => void) | undefined
  readonly onArchive?: ((inboxId: string, threadId: string) => void) | undefined
}

export function uniqueLumenFeedbackInboxThreads(
  threads: readonly LumenFeedbackInboxReferenceThread[],
): readonly LumenFeedbackInboxReferenceThread[] {
  const seen = new Set<string>()
  return threads.filter((thread) => {
    if (seen.has(thread.id)) return false
    seen.add(thread.id)
    return true
  })
}

export function selectLumenFeedbackInboxThread(
  threads: readonly LumenFeedbackInboxReferenceThread[],
  selectedId: string | undefined,
): LumenFeedbackInboxReferenceThread | undefined {
  const unique = uniqueLumenFeedbackInboxThreads(threads)
  return unique.find((thread) => thread.id === selectedId) ?? unique[0]
}

export function LumenFeedbackInboxReference({
  content,
  onAction,
}: {
  readonly content: LumenFeedbackInboxReferenceContent
  readonly onAction: ((event: LumenFeedbackAction) => void) | undefined
}): React.ReactElement {
  const threads = uniqueLumenFeedbackInboxThreads(content.threads)
  const selected = selectLumenFeedbackInboxThread(threads, content.selectedThreadId)
  const detail = content.details.find((item) => item.threadId === selected?.id)
  const noteId = `${content.inboxId}-note`
  return (
    <div className="lumen-feedback-inbox-reference-panel">
      <div className="lumen-feedback-inbox-reference-header">
        <div>
          <h2>{content.labels.title}</h2>
          <p>{content.labels.summary}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            content.onArchiveRead?.(content.inboxId)
            onAction?.({ actionId: 'archive-read' })
          }}
        >
          <Archive data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
          {content.labels.archiveRead}
        </button>
      </div>
      <div className="lumen-feedback-inbox-reference-workspace">
        <div
          className="lumen-feedback-inbox-reference-list"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
        >
          <ul>
            {threads.map((thread) => {
              const Icon = thread.channel === 'email' ? Mail : thread.channel === 'web' ? Globe2 : MessageSquare
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    className={selected?.id === thread.id ? 'is-selected' : ''}
                    aria-current={selected?.id === thread.id}
                    onClick={() => {
                      content.onSelectThread?.(content.inboxId, thread.id)
                      onAction?.({ actionId: 'select-thread', value: thread.id })
                    }}
                  >
                    <span className="lumen-feedback-inbox-reference-row-heading">
                      {thread.unread ? (
                        <span
                          role="img"
                          aria-label={content.labels.unread}
                          className="lumen-feedback-inbox-reference-unread"
                        />
                      ) : null}
                      <span>{thread.sender}</span>
                      <small>{thread.relativeTime}</small>
                    </span>
                    <p>{thread.subject}</p>
                    <span className="lumen-feedback-inbox-reference-row-account">
                      <Icon data-icon-tier="xs" strokeWidth={1.5} aria-hidden="true" />
                      {thread.account}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {threads.length === 0 ? (
            <p className="lumen-feedback-inbox-reference-empty">{content.labels.emptyThreads}</p>
          ) : null}
        </div>
        <div
          className="lumen-feedback-inbox-reference-detail"
          data-hbar-app-ui-list-strategy={content.detailStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.detailStrategy.expectedMaximum}
        >
          {selected && detail ? (
            <>
              <div className="lumen-feedback-inbox-reference-detail-scroll">
                <div className="lumen-feedback-inbox-reference-person">
                  <span aria-hidden="true">{selected.initials}</span>
                  <div>
                    <p>{selected.sender}</p>
                    <p>{detail.meta}</p>
                  </div>
                  <small>{detail.sentiment}</small>
                </div>
                <h3>{selected.subject}</h3>
                <p className="lumen-feedback-inbox-reference-body">{detail.body}</p>
                <div className="lumen-feedback-inbox-reference-tags">
                  {detail.tags.map((tag) => (
                    <span key={tag.id}>
                      <Tag data-icon-tier="xs" strokeWidth={1.5} aria-hidden="true" />
                      {tag.label}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      content.onAddTag?.(content.inboxId, selected.id)
                      onAction?.({ actionId: 'add-tag', value: selected.id })
                    }}
                  >
                    {content.labels.addTag}
                  </button>
                </div>
                <dl className="lumen-feedback-inbox-reference-metrics">
                  {detail.metrics.map((metric) => (
                    <div key={metric.id}>
                      <dt>{metric.label}</dt>
                      <dd>{metric.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="lumen-feedback-inbox-reference-related-heading">{content.labels.related}</p>
                <ul className="lumen-feedback-inbox-reference-related">
                  {detail.related.map((item) => (
                    <li key={item.id}>
                      <span>{item.text}</span>
                      <small>{item.author}</small>
                    </li>
                  ))}
                </ul>
                <label className="lumen-feedback-reference-visually-hidden" htmlFor={noteId}>
                  {content.labels.note}
                </label>
                <textarea
                  id={noteId}
                  value={content.noteDraft}
                  placeholder={content.labels.notePlaceholder}
                  onChange={(event) => content.onNoteChange?.(content.inboxId, event.target.value)}
                />
              </div>
              <div className="lumen-feedback-inbox-reference-actions">
                <button
                  type="button"
                  onClick={() => {
                    content.onReply?.(content.inboxId, selected.id)
                    onAction?.({ actionId: 'reply', value: selected.id })
                  }}
                >
                  {content.labels.reply}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    content.onCreateIssue?.(content.inboxId, selected.id)
                    onAction?.({ actionId: 'create-issue', value: selected.id })
                  }}
                >
                  <ArrowUpRight data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
                  {content.labels.createIssue}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    content.onArchive?.(content.inboxId, selected.id)
                    onAction?.({ actionId: 'archive', value: selected.id })
                  }}
                >
                  {content.labels.archive}
                </button>
              </div>
            </>
          ) : (
            <p className="lumen-feedback-inbox-reference-empty">{content.labels.emptyDetail}</p>
          )}
        </div>
      </div>
    </div>
  )
}
