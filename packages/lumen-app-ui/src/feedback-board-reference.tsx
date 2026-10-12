'use client'

import * as React from 'react'
import { ChevronUp, MessageSquare, Plus, Search } from 'lucide-react'
import type { LumenFeedbackAction, LumenFeedbackListStrategy } from './feedback-workflows'
import './feedback-board-reference.css'

export interface LumenFeedbackBoardReferenceRequest {
  readonly id: string
  readonly title: string
  readonly status: 'shipped' | 'in-progress' | 'planned' | 'under-review'
  readonly statusLabel: string
  readonly description: string
  readonly category: string
  readonly commentCount: number
  readonly voteCount: number
  readonly initiallyVoted: boolean
  readonly newRank: number
}

export interface LumenFeedbackBoardReferenceContent {
  readonly boardId: string
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly newRequest: string
    readonly search: string
    readonly sortGroup: string
    readonly voteFor: (title: string) => string
    readonly removeVote: (title: string) => string
    readonly commentCount: (count: number) => string
    readonly empty: string
  }
  readonly sorts: readonly { readonly id: 'top' | 'new' | 'shipped'; readonly label: string }[]
  readonly selectedSortId: 'top' | 'new' | 'shipped'
  readonly searchQuery: string
  readonly requests: readonly LumenFeedbackBoardReferenceRequest[]
  readonly votedIds: readonly string[]
  readonly listStrategy: LumenFeedbackListStrategy
  readonly onSort?: ((boardId: string, sortId: 'top' | 'new' | 'shipped') => void) | undefined
  readonly onSearch?: ((boardId: string, query: string) => void) | undefined
  readonly onVote?: ((boardId: string, requestId: string) => void) | undefined
  readonly onNewRequest?: ((boardId: string) => void) | undefined
}

export function uniqueLumenFeedbackBoardRequests(
  requests: readonly LumenFeedbackBoardReferenceRequest[],
): readonly LumenFeedbackBoardReferenceRequest[] {
  const seen = new Set<string>()
  return requests.filter((request) => {
    if (seen.has(request.id)) return false
    seen.add(request.id)
    return true
  })
}

export function visibleLumenFeedbackBoardRequests(
  requests: readonly LumenFeedbackBoardReferenceRequest[],
  sortId: 'top' | 'new' | 'shipped',
): readonly LumenFeedbackBoardReferenceRequest[] {
  const unique = uniqueLumenFeedbackBoardRequests(requests)
  const visible = sortId === 'shipped' ? unique.filter((request) => request.status === 'shipped') : unique
  return sortId === 'new'
    ? [...visible].sort((left, right) => left.newRank - right.newRank)
    : [...visible].sort((left, right) => right.voteCount - left.voteCount)
}

export function LumenFeedbackBoardReference({
  content,
  onAction,
}: {
  readonly content: LumenFeedbackBoardReferenceContent
  readonly onAction: ((event: LumenFeedbackAction) => void) | undefined
}): React.ReactElement {
  const sorts = [...new Map(content.sorts.map((sort) => [sort.id, sort])).values()]
  const selectedSort = sorts.some((sort) => sort.id === content.selectedSortId)
    ? content.selectedSortId
    : (sorts[0]?.id ?? 'top')
  const requests = visibleLumenFeedbackBoardRequests(content.requests, selectedSort)
  return (
    <div className="lumen-feedback-board-reference-panel">
      <div className="lumen-feedback-board-reference-header">
        <div>
          <h2>{content.labels.title}</h2>
          <p>{content.labels.description}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            content.onNewRequest?.(content.boardId)
            onAction?.({ actionId: 'new-request' })
          }}
        >
          <Plus data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
          {content.labels.newRequest}
        </button>
      </div>
      <div className="lumen-feedback-board-reference-toolbar">
        <div aria-label={content.labels.sortGroup}>
          {sorts.map((sort) => (
            <button
              key={sort.id}
              type="button"
              aria-pressed={selectedSort === sort.id}
              onClick={() => {
                content.onSort?.(content.boardId, sort.id)
                onAction?.({ actionId: 'sort', value: sort.id })
              }}
            >
              {sort.label}
            </button>
          ))}
        </div>
        <label className="lumen-feedback-board-reference-search" htmlFor={`${content.boardId}-search`}>
          <Search data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
          <span className="lumen-feedback-reference-visually-hidden">{content.labels.search}</span>
          <input
            id={`${content.boardId}-search`}
            type="search"
            value={content.searchQuery}
            placeholder={content.labels.search}
            onChange={(event) => content.onSearch?.(content.boardId, event.target.value)}
          />
        </label>
      </div>
      <div
        className="lumen-feedback-board-reference-list"
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
      >
        <div>
          {requests.map((request) => {
            const voted = content.votedIds.includes(request.id)
            const count = request.voteCount + (voted && !request.initiallyVoted ? 1 : 0)
            return (
              <article key={request.id}>
                <button
                  type="button"
                  className="lumen-feedback-board-reference-vote"
                  aria-label={voted ? content.labels.removeVote(request.title) : content.labels.voteFor(request.title)}
                  aria-pressed={voted}
                  onClick={() => {
                    content.onVote?.(content.boardId, request.id)
                    onAction?.({ actionId: 'vote', value: request.id })
                  }}
                >
                  <ChevronUp data-icon-tier="xs" strokeWidth={1.5} aria-hidden="true" />
                  <span>{count}</span>
                </button>
                <div className="lumen-feedback-board-reference-copy">
                  <div>
                    <h3>{request.title}</h3>
                    <span data-status={request.status}>{request.statusLabel}</span>
                  </div>
                  <p>{request.description}</p>
                  <div className="lumen-feedback-board-reference-meta">
                    <span>{request.category}</span>
                    <span>
                      <MessageSquare data-icon-tier="xs" strokeWidth={1.5} aria-hidden="true" />
                      {content.labels.commentCount(request.commentCount)}
                    </span>
                  </div>
                </div>
              </article>
            )
          })}
          {requests.length === 0 ? (
            <p className="lumen-feedback-board-reference-empty">{content.labels.empty}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
