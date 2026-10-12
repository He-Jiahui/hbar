'use client'

import * as React from 'react'
import type { LumenCommentsAction, LumenCommentsListStrategy } from './comments'
import {
  normalizeLumenCommentsCanvasCoordinate,
  projectLumenCommentsCanvas,
  type LumenCommentsCanvasReferencePin,
} from './comments-canvas-model'
import './comments-canvas-reference.css'

export interface LumenCommentsCanvasReferenceContent {
  readonly labels: {
    readonly title: string
    readonly summary: (unresolved: number, reviewers: number) => string
    readonly mode: string
    readonly comments: string
    readonly pin: (label: string, author: string) => string
    readonly resolve: string
    readonly resolved: string
    readonly locate: string
    readonly reply: (label: string) => string
    readonly send: string
    readonly empty: string
  }
  readonly pins: readonly LumenCommentsCanvasReferencePin[]
  readonly activeId: string
  readonly draft: string
  /** Short review set grows on desktop; compact/explicit panes own scrolling. */
  readonly listStrategy: LumenCommentsListStrategy
  readonly onSelectionChange?: ((id: string) => void) | undefined
  readonly onResolvedChange?: ((id: string, resolved: boolean) => void) | undefined
  readonly onDraftChange?: ((value: string) => void) | undefined
  readonly onSend?: ((id: string, draft: string) => void) | undefined
}
function CanvasIcon({ kind }: { readonly kind: 'comment' | 'check' }): React.ReactElement {
  return (
    <svg className="lumen-comments-canvas-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={kind === 'comment' ? 'M3 2h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6l-4 2V3a1 1 0 0 1 1-1Z' : 'm3 8 3 3 7-7'} />
    </svg>
  )
}
/** Decorative wireframe is normal flex flow; only review markers overlay it. */
function CanvasArtwork(): React.ReactElement {
  return (
    <div className="lumen-comments-canvas-artwork" aria-hidden="true">
      <div className="lumen-comments-canvas-skeleton">
        <div className="lumen-comments-canvas-skeleton-title" />
        <div className="lumen-comments-canvas-skeleton-subtitle" />
        <div className="lumen-comments-canvas-skeleton-cards">
          <div />
          <div />
          <div />
        </div>
        <div className="lumen-comments-canvas-skeleton-caption" />
      </div>
      <div className="lumen-comments-canvas-skeleton-footer">
        <div />
        <div />
        <div />
        <div />
      </div>
    </div>
  )
}
function CanvasPin({
  pin,
  selected,
  label,
  onSelect,
}: {
  readonly pin: LumenCommentsCanvasReferencePin
  readonly selected: boolean
  readonly label: string
  readonly onSelect: () => void
}): React.ReactElement {
  const style: React.CSSProperties & {
    readonly '--lumen-comment-pin-x': string
    readonly '--lumen-comment-pin-y': string
  } = {
    '--lumen-comment-pin-x': `${normalizeLumenCommentsCanvasCoordinate(pin.x)}%`,
    '--lumen-comment-pin-y': `${normalizeLumenCommentsCanvasCoordinate(pin.y)}%`,
  }
  return (
    <button
      type="button"
      className={`lumen-comments-canvas-pin${pin.resolved ? ' is-resolved' : ''}`}
      style={style}
      aria-label={label}
      aria-pressed={selected}
      data-hbar-app-ui-action="select-pin"
      data-hbar-app-ui-target={pin.id}
      onClick={onSelect}
    >
      {pin.label}
    </button>
  )
}
export function LumenCommentsCanvasReference({
  content,
  onAction,
}: {
  readonly content: LumenCommentsCanvasReferenceContent
  readonly onAction: ((event: LumenCommentsAction) => void) | undefined
}): React.ReactElement {
  const inputId = React.useId()
  const { pins, selected, unresolved, reviewers } = projectLumenCommentsCanvas(content.pins, content.activeId)
  const select = (id: string, actionId: string) => {
    content.onSelectionChange?.(id)
    onAction?.({ actionId, value: id })
  }
  return (
    <div className="lumen-comments-canvas-layout">
      <header data-hbar-app-ui-region="canvas-header">
        <div>
          <h2>{content.labels.title}</h2>
          <p>{content.labels.summary(unresolved, reviewers)}</p>
        </div>
        <span className="lumen-comments-canvas-mode">
          <CanvasIcon kind="comment" />
          {content.labels.mode}
        </span>
      </header>
      <div className="lumen-comments-canvas-frame">
        <div className="lumen-comments-canvas-board" data-hbar-app-ui-region="canvas">
          <CanvasArtwork />
          {pins.map((pin) => (
            <CanvasPin
              key={pin.id}
              pin={pin}
              selected={pin.id === selected?.id}
              label={content.labels.pin(pin.label, pin.author)}
              onSelect={() => select(pin.id, 'select-pin')}
            />
          ))}
        </div>
        <div className="lumen-comments-canvas-sidebar">
          <div className="lumen-comments-canvas-heading">
            <p>{content.labels.comments}</p>
          </div>
          <div
            className="lumen-comments-canvas-items"
            data-hbar-app-ui-region="canvas-comments"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {pins.length ? (
              pins.map((pin) => (
                <div
                  className="lumen-comments-canvas-card"
                  key={pin.id}
                  data-selected={pin.id === selected?.id}
                  data-hbar-app-ui-target={pin.id}
                >
                  <div className="lumen-comments-canvas-byline">
                    <span className="lumen-comments-canvas-avatar" aria-hidden="true">
                      {pin.initials}
                    </span>
                    <p>{pin.author}</p>
                    <span>{pin.time}</span>
                  </div>
                  <p className={`lumen-comments-canvas-body${pin.resolved ? ' is-resolved' : ''}`}>{pin.body}</p>
                  <div className="lumen-comments-canvas-actions">
                    <button
                      type="button"
                      aria-pressed={pin.resolved}
                      data-hbar-app-ui-action="toggle-resolved"
                      data-hbar-app-ui-target={pin.id}
                      onClick={() => {
                        content.onResolvedChange?.(pin.id, !pin.resolved)
                        onAction?.({ actionId: 'toggle-resolved', value: pin.id })
                      }}
                    >
                      <CanvasIcon kind="check" />
                      {pin.resolved ? content.labels.resolved : content.labels.resolve}
                    </button>
                    <button
                      type="button"
                      data-hbar-app-ui-action="locate-pin"
                      data-hbar-app-ui-target={pin.id}
                      onClick={() => select(pin.id, 'locate-pin')}
                    >
                      {content.labels.locate}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="lumen-comments-canvas-empty">{content.labels.empty}</p>
            )}
          </div>
          {selected ? (
            <div className="lumen-comments-canvas-composer">
              <div>
                <label className="lumen-comments-canvas-label" htmlFor={inputId}>
                  {content.labels.reply(selected.label)}
                </label>
                <input
                  id={inputId}
                  placeholder={content.labels.reply(selected.label)}
                  value={content.draft}
                  onChange={(event) => content.onDraftChange?.(event.currentTarget.value)}
                />
                <button
                  type="button"
                  data-hbar-app-ui-action="send"
                  data-hbar-app-ui-target={selected.id}
                  onClick={() => {
                    content.onSend?.(selected.id, content.draft)
                    onAction?.({ actionId: 'send', value: selected.id })
                  }}
                >
                  {content.labels.send}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
