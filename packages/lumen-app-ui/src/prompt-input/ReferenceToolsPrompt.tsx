'use client'

import { Globe } from 'lucide-react'
import { PromptChoiceMenu, PromptComposer, PromptFrame, uniquePromptItems } from './primitives'
import type { LumenPromptToolsReferenceContent, LumenPromptReferenceViewProps } from './reference-content'
import './reference-tools.css'

export interface ReferenceToolsPromptProps extends LumenPromptReferenceViewProps<LumenPromptToolsReferenceContent> {}

export function ReferenceToolsPrompt({ variantId, className, onAction, viewModel }: ReferenceToolsPromptProps) {
  const { content } = viewModel
  const models = uniquePromptItems(content.models)
  const selectedModel = models.find((model) => model.id === content.modelId) ?? models[0]

  return (
    <PromptFrame content={content} variantId={variantId} className={`lumen-prompt-reference-tools ${className ?? ''}`}>
      {content.composer ? (
        <PromptComposer
          composer={content.composer}
          onDraftChange={viewModel.onDraftChange}
          onRemoveAttachment={viewModel.onRemoveAttachment}
          onAction={onAction}
        >
          <div className="lumen-prompt-reference-tools-options" data-hbar-app-ui-region="prompt-options">
            <div className="lumen-prompt-reference-model" data-hbar-app-ui-region="model-selector">
              <PromptChoiceMenu
                choices={models}
                selectedId={selectedModel?.id ?? ''}
                label={(choiceLabel) => content.labels.model(choiceLabel)}
                onSelect={viewModel.onModelChange}
                anchor="above"
              />
            </div>
            <button
              type="button"
              className="lumen-prompt-reference-search"
              aria-pressed={content.searchEnabled}
              data-hbar-app-ui-action="search-toggle"
              onClick={() => viewModel.onSearchChange?.(!content.searchEnabled)}
            >
              <Globe aria-hidden="true" className="lumen-prompt-reference-icon lumen-prompt-reference-icon-small" />
              {content.labels.search}
            </button>
            <span className="lumen-prompt-reference-token-label" data-hbar-app-ui-region="token-usage">
              {content.tokenLabel}
            </span>
          </div>
        </PromptComposer>
      ) : null}
    </PromptFrame>
  )
}

export default ReferenceToolsPrompt
