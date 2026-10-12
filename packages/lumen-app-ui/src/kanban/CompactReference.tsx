'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight, Grip } from 'lucide-react'
import type { LumenKanbanCompactCard, LumenKanbanContent } from '../kanban'

export default function CompactReference({ content }: { readonly content: LumenKanbanContent }) {
  const flow = content.referenceCompact
  if (!flow) {
    return null
  }

  const columns = flow.columns.filter(
    (column, index) => flow.columns.findIndex((other) => other.id === column.id) === index,
  )
  const cards = flow.cards.filter((card, index) => flow.cards.findIndex((other) => other.id === card.id) === index)
  const selectedColumnId = columns.some((column) => column.id === flow.selectedColumnId)
    ? flow.selectedColumnId
    : columns[0]?.id

  function cardView(card: LumenKanbanCompactCard, columnIndex: number) {
    const previous = columns[columnIndex - 1]
    const next = columns[columnIndex + 1]
    const complete = card.total > 0 && card.completed >= card.total
    return (
      <div className="hbar-app-ui-kanban-compact-card" key={card.id}>
        <div
          className="hbar-app-ui-kanban-compact-card-main"
          role="button"
          tabIndex={0}
          aria-label={flow!.labels.card(card)}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', card.id)
          }}
        >
          <span className="hbar-app-ui-kanban-compact-card-top">
            <span>{card.tag}</span>
            <Grip aria-hidden="true" />
          </span>
          <p>{card.label}</p>
        </div>
        <div className="hbar-app-ui-kanban-compact-card-footer">
          <span
            className={complete ? 'is-complete' : ''}
            aria-label={flow!.labels.progress(card.completed, card.total)}
          >
            {flow!.labels.shortProgress(card.completed, card.total)}
          </span>
          <span className="hbar-app-ui-kanban-compact-avatar">{card.assignee}</span>
          <div className="hbar-app-ui-kanban-compact-arrows">
            <button
              type="button"
              aria-label={flow!.labels.movePrevious(card.label, previous?.label ?? '')}
              disabled={!previous}
              onClick={() => previous && flow!.onMove(card.id, previous.id)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={flow!.labels.moveNext(card.label, next?.label ?? '')}
              disabled={!next}
              onClick={() => next && flow!.onMove(card.id, next.id)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <React.Fragment>
      <header className="hbar-app-ui-kanban-compact-header">
        <h2>{flow.labels.title}</h2>
        <p>{flow.labels.detail(cards.length)}</p>
      </header>
      <div className="hbar-app-ui-kanban-compact-tabs" role="tablist" aria-label={flow.labels.column}>
        {columns.map((column) => (
          <button
            type="button"
            role="tab"
            key={column.id}
            aria-selected={selectedColumnId === column.id}
            onClick={() => flow.onSelectColumn(column.id)}
          >
            <span>{column.label}</span>
            <span>{cards.filter((card) => card.columnId === column.id).length}</span>
          </button>
        ))}
      </div>
      <div className="hbar-app-ui-kanban-compact-board" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
        {columns.map((column, index) => (
          <section
            className="hbar-app-ui-kanban-compact-column"
            aria-label={column.label}
            data-active={selectedColumnId === column.id}
            key={column.id}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => {
              event.preventDefault()
              const cardId = event.dataTransfer.getData('text/plain')
              if (cards.some((card) => card.id === cardId)) {
                flow.onMove(cardId, column.id)
              }
            }}
          >
            <div className="hbar-app-ui-kanban-compact-column-heading">
              <span>{column.label}</span>
              <small>{cards.filter((card) => card.columnId === column.id).length}</small>
            </div>
            <div className="hbar-app-ui-kanban-compact-card-list">
              {cards.filter((card) => card.columnId === column.id).map((card) => cardView(card, index))}
            </div>
          </section>
        ))}
      </div>
      <p className="hbar-app-ui-kanban-compact-announcement" aria-live="polite">
        {flow.announcement}
      </p>
    </React.Fragment>
  )
}
