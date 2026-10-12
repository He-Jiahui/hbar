'use client'

import * as React from 'react'
import { Grip } from 'lucide-react'
import type { LumenKanbanContent, LumenKanbanSprintCard } from '../kanban'
import useKanbanKeyboardGrabFocus from './keyboardGrabFocus'

export default function SprintReference({ content }: { readonly content: LumenKanbanContent }) {
  const flow = content.referenceSprint
  const { cardRef, requestFocus } = useKanbanKeyboardGrabFocus(flow?.grabbedCardId ?? null)
  if (!flow) {
    return null
  }
  const stages = flow.stages.filter((item, index) => flow.stages.findIndex((other) => other.id === item.id) === index)
  const cards = flow.cards.filter((item, index) => flow.cards.findIndex((other) => other.id === item.id) === index)
  const total = cards.reduce((sum, card) => sum + card.points, 0)
  const accepted = cards
    .filter((card) => card.stageId === stages.at(-1)?.id)
    .reduce((sum, card) => sum + card.points, 0)
  const handleCardKey = (event: React.KeyboardEvent<HTMLDivElement>, card: LumenKanbanSprintCard) => {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      if (flow.grabbedCardId === card.id) {
        requestFocus(card.id, () => flow.onDrop(card.id, card.stageId))
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
    const index = stages.findIndex((stage) => stage.id === card.stageId)
    let next: (typeof stages)[number] | undefined
    if (event.key === 'ArrowRight') {
      next = stages[index + 1]
    }
    if (event.key === 'ArrowLeft') {
      next = stages[index - 1]
    }
    if (next) {
      event.preventDefault()
      requestFocus(card.id, () => flow.onMove(card.id, next.id))
    }
  }
  return (
    <React.Fragment>
      <header className="hbar-app-ui-kanban-sprint-header">
        <h2>{flow.labels.title}</h2>
        <p>{flow.labels.detail}</p>
        <div className="hbar-app-ui-kanban-sprint-summary">
          <div>
            <p>{flow.labels.committed}</p>
            <p className="hbar-app-ui-kanban-sprint-metric-value">{flow.labels.points(total)}</p>
          </div>
          <div>
            <p>{flow.labels.accepted}</p>
            <p className="hbar-app-ui-kanban-sprint-metric-value">{flow.labels.points(accepted)}</p>
          </div>
          <div>
            <p>{flow.labels.burned}</p>
            <p className="hbar-app-ui-kanban-sprint-metric-value">
              {flow.labels.burnedValue(total ? Math.round((accepted / total) * 100) : 0)}
            </p>
          </div>
        </div>
      </header>
      <div className="hbar-app-ui-kanban-sprint-scroll" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
        <div className="hbar-app-ui-kanban-sprint-columns">
          {stages.map((stage) => {
            const stageCards = cards.filter((card) => card.stageId === stage.id)
            const points = stageCards.reduce((sum, card) => sum + card.points, 0)
            return (
              <section
                className="hbar-app-ui-kanban-sprint-column"
                aria-label={stage.label}
                key={stage.id}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (flow.grabbedCardId) {
                    flow.onMove(flow.grabbedCardId, stage.id)
                    flow.onDrop(flow.grabbedCardId, stage.id)
                  }
                }}
              >
                <div className="hbar-app-ui-kanban-sprint-column-heading">
                  <span>{stage.label}</span>
                  <small>
                    {stage.capacity ? flow.labels.capacityPoints(points, stage.capacity) : flow.labels.points(points)}
                  </small>
                </div>
                {stage.capacity && (
                  <div
                    className="hbar-app-ui-kanban-sprint-progress"
                    role="progressbar"
                    aria-label={flow.labels.capacity(stage.label)}
                    aria-valuemin={0}
                    aria-valuemax={stage.capacity}
                    aria-valuenow={points}
                  >
                    <span
                      style={{
                        inlineSize: `${Math.min(100, Math.round((points / stage.capacity) * 100))}%`,
                      }}
                    />
                  </div>
                )}
                <div className="hbar-app-ui-kanban-sprint-card-list">
                  {stageCards.map((card) => (
                    <div
                      key={card.id}
                      className={`hbar-app-ui-kanban-sprint-card ${flow.grabbedCardId === card.id ? 'is-grabbed' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-label={flow.labels.card(card)}
                      draggable
                      ref={cardRef(card.id)}
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
                      <span className="hbar-app-ui-kanban-sprint-card-top">
                        {card.id}
                        {card.blocked && (
                          <span className="hbar-app-ui-kanban-sprint-blocked">
                            <span className="hbar-app-ui-kanban-sprint-dot" />
                            {flow.labels.blocked}
                          </span>
                        )}
                        <Grip aria-hidden="true" />
                      </span>
                      <p>{card.label}</p>
                      <span className="hbar-app-ui-kanban-sprint-card-bottom">
                        <span>{card.points}</span>
                        <span className="hbar-app-ui-kanban-sprint-avatar">{card.assignee}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
      <p className="hbar-app-ui-kanban-sprint-announcement" aria-live="polite">
        {flow.announcement}
      </p>
    </React.Fragment>
  )
}
