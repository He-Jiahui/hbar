'use client'

import * as React from 'react'
import { Grip } from 'lucide-react'
import type { LumenKanbanContent, LumenKanbanRegroupCard } from '../kanban'
import useKanbanKeyboardGrabFocus from './keyboardGrabFocus'

function cardColumnId(card: LumenKanbanRegroupCard, groupId: string): string {
  if (groupId === 'assignee') {
    return card.assigneeId
  }
  if (groupId === 'priority') {
    return card.priorityId
  }
  return card.statusId
}

export default function RegroupReference({ content }: { readonly content: LumenKanbanContent }) {
  const flow = content.referenceRegroup
  const { cardRef, requestFocus } = useKanbanKeyboardGrabFocus(flow?.grabbedCardId ?? null)
  if (!flow) {
    return null
  }
  const groups = flow.groups.filter((item, index) => flow.groups.findIndex((other) => other.id === item.id) === index)
  const currentGroup = groups.find((item) => item.id === flow.groupId) ?? groups[0]
  const columns = flow.columns[currentGroup?.id ?? ''] ?? []
  const handleCardKey = (event: React.KeyboardEvent<HTMLDivElement>, card: LumenKanbanRegroupCard) => {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      if (flow.grabbedCardId === card.id) {
        requestFocus(card.id, () => flow.onDrop(card.id, cardColumnId(card, flow.groupId)))
      } else {
        requestFocus(card.id, () => flow.onGrab(card.id))
      }
      return
    }
    if (flow.grabbedCardId !== card.id) {
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      requestFocus(card.id, flow.onCancelGrab)
      return
    }
    const index = columns.findIndex((column) => column.id === cardColumnId(card, flow.groupId))
    let next: (typeof columns)[number] | undefined
    if (event.key === 'ArrowRight') {
      next = columns[index + 1]
    }
    if (event.key === 'ArrowLeft') {
      next = columns[index - 1]
    }
    if (next) {
      event.preventDefault()
      requestFocus(card.id, () => flow.onMove(card.id, flow.groupId, next.id))
    }
  }
  return (
    <React.Fragment>
      <header className="hbar-app-ui-kanban-regroup-header">
        <div>
          <h2>{flow.labels.title}</h2>
          <p>{flow.labels.detail}</p>
        </div>
        <div className="hbar-app-ui-kanban-regroup-tabs" role="tablist" aria-label={flow.labels.groupBy}>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={group.id === currentGroup?.id}
              onClick={() => flow.onGroupChange(group.id)}
            >
              {group.label}
            </button>
          ))}
        </div>
      </header>
      <div className="hbar-app-ui-kanban-regroup-scroll" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
        <div className="hbar-app-ui-kanban-regroup-columns">
          {columns.map((column) => {
            const cards = flow.cards.filter((card) => cardColumnId(card, flow.groupId) === column.id)
            return (
              <section
                className="hbar-app-ui-kanban-regroup-column"
                aria-label={column.label}
                key={column.id}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (flow.grabbedCardId) {
                    flow.onMove(flow.grabbedCardId, flow.groupId, column.id)
                    flow.onDrop(flow.grabbedCardId, column.id)
                  }
                }}
              >
                <div className="hbar-app-ui-kanban-regroup-column-heading">
                  {column.avatar && <span className="hbar-app-ui-kanban-regroup-avatar">{column.avatar}</span>}
                  {column.tone && <span className="hbar-app-ui-kanban-regroup-dot" data-tone={column.tone} />}
                  <span>{column.label}</span>
                  <small>{cards.length}</small>
                </div>
                <div className="hbar-app-ui-kanban-regroup-card-list">
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      role="button"
                      tabIndex={0}
                      aria-label={flow.labels.card(card, currentGroup?.label ?? '', column.label)}
                      draggable
                      ref={cardRef(card.id)}
                      className={`hbar-app-ui-kanban-regroup-card ${flow.grabbedCardId === card.id ? 'is-grabbed' : ''}`}
                      onKeyDown={(event) => handleCardKey(event, card)}
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
                      <span className="hbar-app-ui-kanban-regroup-card-top">
                        <span className="hbar-app-ui-kanban-regroup-dot" data-tone={card.priorityTone} />
                        {card.id}
                        <Grip aria-hidden="true" />
                      </span>
                      <p>{card.label}</p>
                      <span className="hbar-app-ui-kanban-regroup-card-bottom">
                        <span>{card.tag}</span>
                        {flow.groupId !== 'assignee' && (
                          <span className="hbar-app-ui-kanban-regroup-avatar">
                            {flow.columns.assignee?.find((item) => item.id === card.assigneeId)?.avatar}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
      <p className="hbar-app-ui-kanban-regroup-announcement" aria-live="polite">
        {flow.announcement}
      </p>
    </React.Fragment>
  )
}
