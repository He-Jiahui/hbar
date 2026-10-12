'use client'

import * as React from 'react'
import { LumenInput } from './forms'
import { LumenButton, LumenStatus, LumenText } from './primitives'
import type { LumenSupportProps, LumenSupportRequest, LumenSupportRequestsContent } from './support'
import type { LumenSupportRequestsReferenceLayout } from './support/reference-content'
import './support-requests-reference.css'

export interface LumenSupportRequestsReferenceProps {
  readonly content: LumenSupportRequestsContent
  readonly layout: LumenSupportRequestsReferenceLayout
  readonly onAction?: LumenSupportProps['onAction'] | undefined
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function Glyph({ name }: { readonly name: 'plus' | 'search' | 'chevron' }) {
  const paths = {
    plus: 'M8 3v10M3 8h10',
    search: 'm11 11 3 3m-2-7a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
    chevron: 'm6 3 5 5-5 5',
  } as const

  return (
    <svg className="lumen-support-requests-reference-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

function RequestRow({
  request,
  onOpen,
}: {
  readonly request: LumenSupportRequest
  readonly onOpen: (requestId: string) => void
}) {
  return (
    <li className="lumen-support-requests-reference-item">
      <LumenButton
        className="lumen-support-requests-reference-row"
        variant="text"
        data-hbar-app-ui-action="open-request"
        data-hbar-app-ui-target-id={request.id}
        onClick={() => onOpen(request.id)}
      >
        <code className="lumen-support-requests-reference-ticket">{request.id}</code>
        <span className="lumen-support-requests-reference-subject">
          <LumenText as="strong" variant="label">
            {request.title}
          </LumenText>
          <LumenText as="small" tone="muted" variant="supporting">
            {request.detail}
          </LumenText>
        </span>
        <span className="lumen-support-requests-reference-status">
          <LumenStatus value={request.status} tone={request.tone} />
        </span>
        <time className="lumen-support-requests-reference-updated">{request.updated}</time>
        <Glyph name="chevron" />
      </LumenButton>
    </li>
  )
}

export function LumenSupportRequestsReference({ content, layout, onAction }: LumenSupportRequestsReferenceProps) {
  const flow = content.referenceFlow
  const requests = uniqueById(content.requests)
  const statusChoices = uniqueById(content.statuses)
  const proposedStatusId = flow ? (flow.statusId ?? content.allStatusId) : content.initialStatusId
  const activeStatusId = statusChoices.some(({ id }) => id === proposedStatusId)
    ? proposedStatusId
    : content.allStatusId
  const query = flow?.query ?? ''
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const openStatusIds = new Set([...content.openStatusIds, ...layout.waitingStatusIds])
  const waitingStatusIds = new Set(layout.waitingStatusIds)
  const openCount = requests.filter((request) => openStatusIds.has(request.statusId)).length
  const waitingCount = requests.filter((request) => waitingStatusIds.has(request.statusId)).length
  const headingId = React.useId()
  const searchId = React.useId()

  const visibleRequests = requests.filter((request) => {
    const matchesStatus =
      activeStatusId === content.allStatusId ||
      (activeStatusId === layout.openFilterId && openStatusIds.has(request.statusId)) ||
      request.statusId === activeStatusId
    const searchable = `${request.id} ${request.title} ${request.detail}`.toLocaleLowerCase()
    return matchesStatus && searchable.includes(normalizedQuery)
  })

  function selectStatus(statusId: string): void {
    if (flow) {
      flow.onStatusChange(statusId)
      return
    }
    onAction?.({ actionId: 'filter-status', value: statusId })
  }

  function changeQuery(nextQuery: string): void {
    if (flow) {
      flow.onQueryChange(nextQuery)
      return
    }
    onAction?.({ actionId: 'search-requests', value: nextQuery })
  }

  function openRequest(requestId: string): void {
    onAction?.({ actionId: 'open', value: requestId })
  }

  return (
    <section className="lumen-support-requests-reference" aria-labelledby={headingId}>
      <header className="lumen-support-requests-reference-heading">
        <div>
          <LumenText as="h2" id={headingId} variant="title">
            {content.labels.title}
          </LumenText>
          <LumenText as="p" tone="muted" variant="supporting">
            {layout.labels.summary(openCount, waitingCount)}
          </LumenText>
        </div>
        <LumenButton
          className="lumen-support-requests-reference-new"
          tone="primary"
          data-hbar-app-ui-action="new-request"
          onClick={() => onAction?.({ actionId: 'open', value: 'new-request' })}
        >
          <Glyph name="plus" />
          {content.labels.newRequest}
        </LumenButton>
      </header>

      <div className="lumen-support-requests-reference-tools">
        <div className="lumen-support-requests-reference-filters" role="group" aria-label={content.labels.statuses}>
          {statusChoices.map((choice) => (
            <LumenButton
              key={choice.id}
              className="lumen-support-requests-reference-filter"
              variant="text"
              disabled={choice.disabled}
              aria-pressed={activeStatusId === choice.id}
              data-hbar-app-ui-action="filter-status"
              data-hbar-app-ui-target-id={choice.id}
              onClick={() => selectStatus(choice.id)}
            >
              {choice.label}
            </LumenButton>
          ))}
        </div>
        <label className="lumen-support-requests-reference-search" htmlFor={searchId}>
          <Glyph name="search" />
          <LumenInput
            id={searchId}
            type="search"
            aria-label={content.labels.search}
            data-hbar-app-ui-field="query"
            value={query}
            placeholder={layout.labels.searchPlaceholder}
            onChange={(event) => changeQuery(event.currentTarget.value)}
          />
        </label>
      </div>

      <div className="lumen-support-requests-reference-list">
        <div className="lumen-support-requests-reference-columns">
          <span className="lumen-support-requests-reference-ticket">{content.labels.ticket}</span>
          <span className="lumen-support-requests-reference-subject">{content.labels.subject}</span>
          <span className="lumen-support-requests-reference-status">{content.labels.status}</span>
          <span className="lumen-support-requests-reference-updated">{content.labels.updated}</span>
          <span className="lumen-support-requests-reference-chevron" />
        </div>
        <ul
          className="lumen-support-requests-reference-rows"
          data-hbar-app-ui-region="request-list"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          {visibleRequests.map((request) => (
            <RequestRow key={request.id} request={request} onOpen={openRequest} />
          ))}
        </ul>
        {visibleRequests.length === 0 ? (
          <LumenText as="p" className="lumen-support-requests-reference-empty" tone="muted">
            {content.labels.empty}
          </LumenText>
        ) : null}
      </div>

      <LumenText as="p" className="lumen-support-requests-reference-note" tone="muted" variant="supporting">
        {content.labels.note}
      </LumenText>
    </section>
  )
}
