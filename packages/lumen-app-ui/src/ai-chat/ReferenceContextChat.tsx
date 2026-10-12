'use client'

import { SlidersHorizontal } from 'lucide-react'
import {
  ReferenceComposer,
  ReferenceFrame,
  ReferenceMessages,
  ReferenceModelMenu,
  uniqueReferenceItems,
} from './primitives'
import type { LumenAiChatContextReferenceContent, LumenAiChatReferenceViewProps } from './reference-content'
import './reference-context.css'

export function ReferenceContextChat({
  variantId,
  className,
  onAction,
  viewModel,
}: LumenAiChatReferenceViewProps<LumenAiChatContextReferenceContent>) {
  const { content } = viewModel
  const models = uniqueReferenceItems(content.models)
  const selectedModel = models.find((model) => model.id === content.selectedModelId) ?? models[0]
  const modelMenuLabel = selectedModel ? `${content.modelLabel} ${selectedModel.label}` : content.modelLabel
  const contextPercent = Math.round(
    (Number.isFinite(content.contextRatio) ? Math.min(1, Math.max(0, content.contextRatio)) : 0) * 100,
  )

  return (
    <ReferenceFrame
      content={content}
      variantId={variantId}
      className={`lumen-ai-chat-reference-context ${className ?? ''}`}
    >
      <header className="lumen-ai-chat-reference-header lumen-ai-chat-context-header">
        <h1>{content.title}</h1>
        <div className="lumen-ai-chat-context-controls">
          <ReferenceModelMenu
            choices={models}
            selectedId={selectedModel?.id ?? ''}
            label={modelMenuLabel}
            onSelect={viewModel.onModelChange}
            anchor="below"
          />
          <div className="lumen-ai-chat-context-usage">
            <div
              className="lumen-ai-chat-context-track"
              role="meter"
              aria-label={content.contextLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={contextPercent}
              data-hbar-app-ui-region="context-usage"
            >
              <span style={{ inlineSize: `${contextPercent}%` }} />
            </div>
            <span>{content.contextLabel}</span>
          </div>
          <button
            className="lumen-ai-chat-context-settings"
            type="button"
            aria-label={content.settingsLabel}
            title={content.settingsLabel}
            data-hbar-app-ui-action="conversation-settings"
            onClick={() => onAction?.({ actionId: 'conversation-settings', value: content.ownerId })}
          >
            <SlidersHorizontal aria-hidden="true" className="lumen-ai-chat-reference-icon" />
          </button>
        </div>
      </header>
      <div className="lumen-ai-chat-reference-conversation">
        <ReferenceMessages content={content} onAction={onAction} />
        {content.composer ? (
          <ReferenceComposer
            composer={content.composer}
            onDraftChange={viewModel.onDraftChange}
            onRemoveAttachment={viewModel.onRemoveAttachment}
            onAction={onAction}
          />
        ) : null}
      </div>
    </ReferenceFrame>
  )
}

export default ReferenceContextChat
