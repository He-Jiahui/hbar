'use client'

import * as React from 'react'
import { ChevronDown, Grip } from 'lucide-react'
import type { LumenKanbanContent, LumenKanbanSwimlaneCard } from '../kanban'
import useKanbanKeyboardGrabFocus from './keyboardGrabFocus'

export default function SwimlanesReference({ content }: { readonly content: LumenKanbanContent }) {
  const flow = content.referenceSwimlanes
  const { cardRef, requestFocus } = useKanbanKeyboardGrabFocus(flow?.grabbedCardId ?? null)
  if (!flow) {
    return null
  }
  const stages = flow.stages.filter((stage, index) => flow.stages.findIndex((item) => item.id === stage.id) === index)
  const lanes = flow.lanes.filter((lane, index) => flow.lanes.findIndex((item) => item.id === lane.id) === index)
  const allCollapsed = lanes.length > 0 && lanes.every((lane) => flow.collapsedLaneIds.includes(lane.id))
  const handleCardKey = (event: React.KeyboardEvent<HTMLDivElement>, card: LumenKanbanSwimlaneCard, laneId: string) => {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      if (flow.grabbedCardId === card.id) {
        requestFocus(card.id, () => flow.onDrop(card.id))
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
    const stageIndex = stages.findIndex((stage) => stage.id === card.stageId)
    const laneIndex = lanes.findIndex((lane) => lane.id === laneId)
    let nextStage = stages[stageIndex]
    let nextLane = lanes[laneIndex]
    if (event.key === 'ArrowRight') {
      nextStage = stages[stageIndex + 1]
    }
    if (event.key === 'ArrowLeft') {
      nextStage = stages[stageIndex - 1]
    }
    if (event.key === 'ArrowDown') {
      nextLane = lanes[laneIndex + 1]
    }
    if (event.key === 'ArrowUp') {
      nextLane = lanes[laneIndex - 1]
    }
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      return
    }
    event.preventDefault()
    if (nextStage && nextLane) {
      requestFocus(card.id, () => flow.onMove(card.id, nextLane.id, nextStage.id))
    }
  }
  return (
    <React.Fragment>
      <header className="hbar-app-ui-kanban-swimlane-header">
        <div>
          <h2>{flow.labels.title}</h2>
          <p>{flow.labels.detail}</p>
        </div>
        <button type="button" onClick={flow.onToggleAll}>
          {allCollapsed ? flow.labels.expandAll : flow.labels.collapseAll}
        </button>
      </header>
      <div className="hbar-app-ui-kanban-swimlane-scroll" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
        <div className="hbar-app-ui-kanban-swimlane-content">
          <div className="hbar-app-ui-kanban-swimlane-stages">
            {stages.map((stage) => (
              <span key={stage.id}>
                {stage.label}
                <small>
                  {lanes.reduce(
                    (total, lane) => total + lane.cards.filter((card) => card.stageId === stage.id).length,
                    0,
                  )}
                </small>
              </span>
            ))}
          </div>
          {lanes.map((lane) => {
            const collapsed = flow.collapsedLaneIds.includes(lane.id)
            const done = lane.cards.filter((card) => card.stageId === stages.at(-1)?.id).length
            return (
              <section className="hbar-app-ui-kanban-swimlane-lane" aria-label={lane.label} key={lane.id}>
                <header>
                  <button type="button" aria-expanded={!collapsed} onClick={() => flow.onToggleLane(lane.id)}>
                    <ChevronDown aria-hidden="true" />
                    {lane.label}
                  </button>
                  <small>{flow.labels.shipped(done, lane.cards.length)}</small>
                  <span className="hbar-app-ui-kanban-swimlane-avatar">{lane.avatar}</span>
                </header>
                {!collapsed && (
                  <div className="hbar-app-ui-kanban-swimlane-cells">
                    {stages.map((stage) => (
                      <div
                        className="hbar-app-ui-kanban-swimlane-cell"
                        key={stage.id}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (flow.grabbedCardId) {
                            flow.onMove(flow.grabbedCardId, lane.id, stage.id)
                            flow.onDrop(flow.grabbedCardId)
                          }
                        }}
                      >
                        {lane.cards
                          .filter((card) => card.stageId === stage.id)
                          .map((card) => (
                            <div
                              className={`hbar-app-ui-kanban-swimlane-card ${flow.grabbedCardId === card.id ? 'is-grabbed' : ''}`}
                              role="button"
                              aria-roledescription={flow.labels.draggableCard}
                              tabIndex={0}
                              aria-label={flow.labels.card(card, lane.label, stage.label)}
                              draggable
                              ref={cardRef(card.id)}
                              key={card.id}
                              onKeyDown={(event) => handleCardKey(event, card, lane.id)}
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
                              <span className="hbar-app-ui-kanban-swimlane-card-top">
                                {card.id}
                                <Grip aria-hidden="true" />
                              </span>
                              <p>{card.label}</p>
                              <span className="hbar-app-ui-kanban-swimlane-points">
                                {flow.labels.points(card.points)}
                              </span>
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>
      <p className="hbar-app-ui-kanban-swimlane-announcement" aria-live="polite">
        {flow.announcement}
      </p>
    </React.Fragment>
  )
}
