'use client'

import * as React from 'react'
import { Grip, MessageSquare, X } from 'lucide-react'
import type { LumenKanbanContent } from '../kanban'

export default function DetailReference({ content }: { readonly content: LumenKanbanContent }) {
  const flow = content.referenceDetail
  if (!flow) {
    return null
  }
  const columns = flow.columns.filter(
    (item, index) => flow.columns.findIndex((other) => other.id === item.id) === index,
  )
  const cards = flow.cards.filter((item, index) => flow.cards.findIndex((other) => other.id === item.id) === index)
  const selected = cards.find((card) => card.id === flow.selectedCardId)
  const stage = selected && columns.find((column) => column.id === selected.statusId)
  const detailsUnavailable = selected?.detailAvailability === 'unavailable'
  const detailsUnavailableNotice =
    detailsUnavailable && flow.labels.detailUnavailable ? (
      <p className="hbar-app-ui-kanban-detail-no-activity">{flow.labels.detailUnavailable}</p>
    ) : null
  return (
    <React.Fragment>
      <header className="hbar-app-ui-kanban-detail-header">
        <h2>{flow.labels.title}</h2>
        <p>{flow.labels.detail(cards.length)}</p>
      </header>
      <div className={`hbar-app-ui-kanban-detail-workspace ${selected ? 'has-details' : ''}`}>
        <div className="hbar-app-ui-kanban-detail-board" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
          <div className="hbar-app-ui-kanban-detail-columns">
            {columns.map((column) => {
              const inColumn = cards.filter((card) => card.statusId === column.id)
              return (
                <section
                  className="hbar-app-ui-kanban-detail-column"
                  key={column.id}
                  aria-label={column.label}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (flow.grabbedCardId) {
                      flow.onMove(flow.grabbedCardId, column.id)
                    }
                  }}
                >
                  <div className="hbar-app-ui-kanban-detail-column-heading">
                    {column.label}
                    <small>{inColumn.length}</small>
                  </div>
                  <div className="hbar-app-ui-kanban-detail-card-list">
                    {inColumn.map((card) => (
                      <div
                        key={card.id}
                        className="hbar-app-ui-kanban-detail-card"
                        role="button"
                        tabIndex={0}
                        aria-pressed={card.id === selected?.id}
                        aria-label={flow.labels.card(card)}
                        draggable
                        onClick={() => flow.onSelect(card.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            flow.onSelect(card.id)
                          }
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move'
                          flow.onGrab(card.id)
                        }}
                        onDragEnd={(event) => {
                          if (event.dataTransfer.dropEffect === 'none') {
                            flow.onCancelGrab()
                          }
                        }}
                      >
                        <span className="hbar-app-ui-kanban-detail-card-top">
                          <span className="hbar-app-ui-kanban-detail-dot" data-tone={card.tone} />
                          {card.id}
                          <Grip aria-hidden="true" />
                        </span>
                        <p>{card.label}</p>
                        <span className="hbar-app-ui-kanban-detail-card-bottom">
                          <span>{flow.labels.shortPoints(card.points)}</span>
                          {(card.activityCount ?? card.activity?.length ?? 0) > 0 && (
                            <span className="hbar-app-ui-kanban-detail-comment">
                              <MessageSquare aria-hidden="true" />
                              {card.activityCount ?? card.activity?.length}
                            </span>
                          )}
                          <span className="hbar-app-ui-kanban-detail-avatar">{card.assignee}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
        {selected && (
          <button
            type="button"
            className="hbar-app-ui-kanban-detail-backdrop"
            aria-label={flow.labels.close}
            onClick={flow.onClose}
          />
        )}
        {selected && (
          <aside className="hbar-app-ui-kanban-detail-pane" aria-label={flow.labels.details(selected.id)}>
            <div className="hbar-app-ui-kanban-detail-pane-scroll">
              <div className="hbar-app-ui-kanban-detail-pane-top">
                <span>{selected.id}</span>
                <span className="hbar-app-ui-kanban-detail-status">{stage?.label}</span>
                <button type="button" aria-label={flow.labels.close} onClick={flow.onClose}>
                  <X aria-hidden="true" />
                </button>
              </div>
              <h3>{selected.label}</h3>
              <div className="hbar-app-ui-kanban-detail-properties">
                <div>
                  <span>{flow.labels.assignee}</span>
                  <span className="hbar-app-ui-kanban-detail-property-value">{selected.assigneeName}</span>
                </div>
                {selected.detailAvailability !== 'unavailable' && selected.priority ? (
                  <div>
                    <span>{flow.labels.priority}</span>
                    <span className="hbar-app-ui-kanban-detail-property-value">{selected.priority}</span>
                  </div>
                ) : null}
                <div>
                  <span>{flow.labels.estimate}</span>
                  <span className="hbar-app-ui-kanban-detail-property-value">
                    {flow.labels.points(selected.points)}
                  </span>
                </div>
              </div>
              <p className="hbar-app-ui-kanban-detail-caption">{flow.labels.moveTo}</p>
              <div className="hbar-app-ui-kanban-detail-move">
                {columns.map((column) => (
                  <button
                    type="button"
                    key={column.id}
                    aria-pressed={column.id === selected.statusId}
                    onClick={() => flow.onMove(selected.id, column.id)}
                  >
                    {column.label}
                  </button>
                ))}
              </div>
              {detailsUnavailable ? (
                detailsUnavailableNotice
              ) : (
                <React.Fragment>
                  {selected.description ? (
                    <p className="hbar-app-ui-kanban-detail-description">{selected.description}</p>
                  ) : null}
                  <p className="hbar-app-ui-kanban-detail-caption">{flow.labels.activity}</p>
                  {selected.activity?.length ? (
                    <ul className="hbar-app-ui-kanban-detail-activity">
                      {selected.activity.map((item) => (
                        <li key={item.id}>
                          <span>
                            <span className="hbar-app-ui-kanban-detail-avatar">{item.avatar}</span>
                            <span className="hbar-app-ui-kanban-detail-activity-name">{item.name}</span>
                            <small>{item.time}</small>
                          </span>
                          <p>{item.text}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hbar-app-ui-kanban-detail-no-activity">{flow.labels.noActivity}</p>
                  )}
                </React.Fragment>
              )}
            </div>
          </aside>
        )}
      </div>
      <p className="hbar-app-ui-kanban-detail-announcement" aria-live="polite">
        {flow.announcement}
      </p>
    </React.Fragment>
  )
}
