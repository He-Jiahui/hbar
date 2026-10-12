'use client'

import * as React from 'react'
import { Grip, MessageSquare, Paperclip, Plus, X } from 'lucide-react'
import type { LumenKanbanAction, LumenKanbanContent, LumenKanbanReferenceCard } from '../kanban'
import useKanbanKeyboardGrabFocus from './keyboardGrabFocus'

export function BoardReference({
  content,
  onAction,
}: {
  readonly content: LumenKanbanContent
  readonly onAction?: ((event: LumenKanbanAction) => void) | undefined
}) {
  const flow = content.referenceBoard
  const { cardRef, requestFocus } = useKanbanKeyboardGrabFocus(flow?.grabbedCardId ?? null)
  if (!flow) {
    return null
  }
  const cards = new Map<string, LumenKanbanReferenceCard>()
  for (const card of flow.cards) {
    if (!cards.has(card.id)) {
      cards.set(card.id, card)
    }
  }
  const columns = flow.columns.filter(
    (column, index) => flow.columns.findIndex((item) => item.id === column.id) === index,
  )
  const count = columns.reduce((total, column) => total + column.cardIds.length, 0)
  const targetIndex = columns.findIndex((column) => column.id === flow.targetColumnId)
  const activateCard = (
    event: React.KeyboardEvent<HTMLDivElement>,
    card: LumenKanbanReferenceCard,
    columnId: string,
  ) => {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      if (flow.grabbedCardId === card.id) {
        requestFocus(card.id, () => {
          flow.onDrop(card.id, flow.targetColumnId ?? columnId)
          onAction?.({ actionId: 'move', value: card.id })
        })
      } else {
        requestFocus(card.id, () => flow.onGrab(card.id, columnId))
      }
    } else if (flow.grabbedCardId === card.id && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault()
      const next = columns[targetIndex + (event.key === 'ArrowRight' ? 1 : -1)]
      if (next) {
        requestFocus(card.id, () => flow.onTargetChange(next.id))
      }
    } else if (event.key === 'Escape' && flow.grabbedCardId === card.id) {
      event.preventDefault()
      requestFocus(card.id, flow.onCancelGrab)
    }
  }
  return (
    <React.Fragment>
      <header className="hbar-app-ui-kanban-reference-header">
        <div>
          <h2>{content.labels.boardTitle}</h2>
          <p>{flow.labels.detail(count)}</p>
        </div>
        <div className="hbar-app-ui-kanban-reference-participants" aria-label={content.labels.participants}>
          {content.participants.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
      </header>
      <div className="hbar-app-ui-kanban-reference-board" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
        {columns.length ? (
          columns.map((column) => (
            <section
              className="hbar-app-ui-kanban-reference-column"
              aria-label={column.label}
              key={column.id}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => {
                event.preventDefault()
                const cardId = event.dataTransfer.getData('text/plain') || flow.grabbedCardId
                if (cardId && cards.has(cardId)) {
                  flow.onDrop(cardId, column.id)
                }
              }}
            >
              <header>
                <span>{column.label}</span>
                <small>{column.limit ? `${column.cardIds.length}/${column.limit}` : column.cardIds.length}</small>
                <button
                  type="button"
                  aria-label={content.labels.add(column.label)}
                  onClick={() => flow.onOpenComposer(column.id)}
                >
                  <Plus aria-hidden="true" />
                </button>
              </header>
              {flow.composerColumnId === column.id && (
                <form
                  className="hbar-app-ui-kanban-reference-composer"
                  onSubmit={(event) => {
                    event.preventDefault()
                    flow.onAddCard()
                  }}
                >
                  <label htmlFor={`kanban-new-${column.id}`}>{flow.labels.newCardIn(column.label)}</label>
                  <input
                    id={`kanban-new-${column.id}`}
                    value={flow.draft}
                    placeholder={flow.labels.placeholder}
                    onChange={(event) => flow.onDraftChange(event.currentTarget.value)}
                  />
                  <div>
                    <button type="submit">{flow.labels.add}</button>
                    <button type="button" aria-label={flow.labels.cancel} onClick={flow.onCancelComposer}>
                      <X aria-hidden="true" />
                    </button>
                  </div>
                </form>
              )}
              <ul>
                {column.cardIds.map((id) => {
                  const card = cards.get(id)
                  if (!card) {
                    return null
                  }
                  return (
                    <li key={card.id}>
                      <div
                        className={`hbar-app-ui-kanban-reference-card ${flow.grabbedCardId === card.id ? 'is-grabbed' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={flow.labels.card(card)}
                        draggable
                        ref={cardRef(card.id)}
                        onClick={() => onAction?.({ actionId: 'open', value: card.id })}
                        onKeyDown={(event) => activateCard(event, card, column.id)}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', card.id)
                          flow.onGrab(card.id, column.id)
                        }}
                        onDragEnd={flow.onCancelGrab}
                      >
                        <div className="hbar-app-ui-kanban-reference-card-top">
                          <span
                            className={`hbar-app-ui-kanban-reference-priority is-${card.priority}`}
                            aria-hidden="true"
                          />
                          <span>{card.id}</span>
                          <Grip aria-hidden="true" />
                        </div>
                        <p>{card.label}</p>
                        <div className="hbar-app-ui-kanban-reference-card-footer">
                          <span className="hbar-app-ui-kanban-reference-tag">{card.tag}</span>
                          {card.comments !== undefined && (
                            <span>
                              <MessageSquare aria-hidden="true" />
                              {card.comments}
                            </span>
                          )}
                          {card.files !== undefined && (
                            <span>
                              <Paperclip aria-hidden="true" />
                              {card.files}
                            </span>
                          )}
                          <span className="hbar-app-ui-kanban-reference-assignee">{card.assignee}</span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="hbar-app-ui-kanban-reference-drop-target" aria-hidden="true" />
            </section>
          ))
        ) : (
          <p>{content.labels.empty}</p>
        )}
      </div>
      <p className="hbar-app-ui-kanban-reference-announcement" aria-live="polite">
        {flow.announcement}
      </p>
    </React.Fragment>
  )
}

export default BoardReference
