'use client'

import * as React from 'react'
import { Bug, Check, Heart, Image, ImagePlus, Lightbulb, X } from 'lucide-react'
import type { LumenFeedbackAction, LumenFeedbackType } from './feedback-workflows'
import './feedback-widget-reference.css'

export interface LumenFeedbackReferenceType {
  readonly id: LumenFeedbackType
  readonly label: string
  readonly placeholder: string
}

export interface LumenFeedbackWidgetReferenceContent {
  readonly widgetId: string
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly close: string
    readonly typeGroup: string
    readonly prompt: string
    readonly emptyTypes: string
    readonly emptyPlaceholder: string
    readonly screenshotAttached: string
    readonly attachScreenshot: string
    readonly privacyNotice: string
    readonly remainingCharacters: (count: number) => string
    readonly cancel: string
    readonly send: string
    readonly sentTitle: string
    readonly sentDescription: string
    readonly sendAnother: string
  }
  readonly types: readonly LumenFeedbackReferenceType[]
  readonly selectedTypeId: LumenFeedbackType | undefined
  readonly draft: string
  readonly screenshotAttached: boolean
  readonly phase: 'editing' | 'sent'
  readonly maximumCharacters: number
  readonly typeStrategy: Readonly<{ kind: 'pane-scroll'; expectedMaximum: number }>
  readonly onSelectType?: ((widgetId: string, typeId: LumenFeedbackType) => void) | undefined
  readonly onDraftChange?: ((widgetId: string, draft: string) => void) | undefined
  readonly onToggleScreenshot?: ((widgetId: string) => void) | undefined
  readonly onSubmit?: ((widgetId: string) => void) | undefined
  readonly onSendAnother?: ((widgetId: string) => void) | undefined
  readonly onCancel?: ((widgetId: string) => void) | undefined
  readonly onClose?: ((widgetId: string) => void) | undefined
}

export function uniqueLumenFeedbackReferenceTypes(
  types: readonly LumenFeedbackReferenceType[],
): readonly LumenFeedbackReferenceType[] {
  const seen = new Set<LumenFeedbackType>()
  return types.filter((type) => {
    if (seen.has(type.id)) return false
    seen.add(type.id)
    return true
  })
}

const typeIcons = { idea: Lightbulb, issue: Bug, praise: Heart }

export function LumenFeedbackWidgetReference({
  content,
  onAction,
}: {
  readonly content: LumenFeedbackWidgetReferenceContent
  readonly onAction: ((event: LumenFeedbackAction) => void) | undefined
}): React.ReactElement {
  const types = uniqueLumenFeedbackReferenceTypes(content.types)
  const selected = types.find((type) => type.id === content.selectedTypeId) ?? types[0]
  const remaining = Math.max(0, content.maximumCharacters - content.draft.length)
  return (
    <div className="lumen-feedback-reference-card">
      {content.phase === 'sent' ? (
        <div className="lumen-feedback-reference-complete">
          <span className="lumen-feedback-reference-complete-symbol">
            <Check data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p>{content.labels.sentTitle}</p>
          <p>{content.labels.sentDescription}</p>
          <button
            type="button"
            onClick={() => {
              content.onSendAnother?.(content.widgetId)
              onAction?.({ actionId: 'send-another' })
            }}
          >
            {content.labels.sendAnother}
          </button>
        </div>
      ) : (
        <>
          <div className="lumen-feedback-reference-header">
            <div>
              <h2>{content.labels.title}</h2>
              <p>{content.labels.description}</p>
            </div>
            <button
              type="button"
              aria-label={content.labels.close}
              onClick={() => {
                content.onClose?.(content.widgetId)
                onAction?.({ actionId: 'close' })
              }}
            >
              <X data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
          <div
            className="lumen-feedback-reference-types"
            role="radiogroup"
            aria-label={content.labels.typeGroup}
            data-hbar-app-ui-list-strategy={content.typeStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.typeStrategy.expectedMaximum}
          >
            {types.map((type) => {
              const Icon = typeIcons[type.id]
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected?.id === type.id}
                  key={type.id}
                  onClick={() => {
                    content.onSelectType?.(content.widgetId, type.id)
                    onAction?.({ actionId: 'type', value: type.id })
                  }}
                >
                  <Icon data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
                  {type.label}
                </button>
              )
            })}
            {types.length === 0 ? <p>{content.labels.emptyTypes}</p> : null}
          </div>
          <div className="lumen-feedback-reference-message">
            <label className="lumen-feedback-reference-visually-hidden" htmlFor={`${content.widgetId}-message`}>
              {content.labels.prompt}
            </label>
            <textarea
              id={`${content.widgetId}-message`}
              value={content.draft}
              placeholder={selected?.placeholder ?? content.labels.emptyPlaceholder}
              maxLength={content.maximumCharacters}
              onChange={(event) => content.onDraftChange?.(content.widgetId, event.target.value)}
            />
            <div className="lumen-feedback-reference-message-footer">
              <button
                type="button"
                onClick={() => {
                  content.onToggleScreenshot?.(content.widgetId)
                  onAction?.({ actionId: 'screenshot' })
                }}
              >
                {content.screenshotAttached ? (
                  <Image data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <ImagePlus data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
                )}
                {content.screenshotAttached ? content.labels.screenshotAttached : content.labels.attachScreenshot}
              </button>
              <span>{content.labels.remainingCharacters(remaining)}</span>
            </div>
          </div>
          <div className="lumen-feedback-reference-privacy">
            <p>{content.labels.privacyNotice}</p>
          </div>
          <div className="lumen-feedback-reference-actions">
            <button
              type="button"
              onClick={() => {
                content.onCancel?.(content.widgetId)
                onAction?.({ actionId: 'cancel' })
              }}
            >
              {content.labels.cancel}
            </button>
            <button
              type="button"
              disabled={!selected || !content.draft.trim()}
              onClick={() => {
                content.onSubmit?.(content.widgetId)
                onAction?.({ actionId: 'send', value: selected?.id })
              }}
            >
              {content.labels.send}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
