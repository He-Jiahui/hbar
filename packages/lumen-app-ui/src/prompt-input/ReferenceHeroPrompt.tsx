'use client'

import { BarChart3, FileText, ListChecks, Store } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PromptComposer, PromptFrame, uniquePromptItems } from './primitives'
import type { LumenPromptHeroReferenceContent, LumenPromptReferenceViewProps } from './reference-content'
import './reference-hero.css'

export interface ReferenceHeroPromptProps extends LumenPromptReferenceViewProps<LumenPromptHeroReferenceContent> {}

const suggestionIcons: Record<LumenPromptHeroReferenceContent['suggestions'][number]['icon'], LucideIcon> = {
  page: FileText,
  chart: BarChart3,
  store: Store,
  checklist: ListChecks,
}

export function ReferenceHeroPrompt({ variantId, className, onAction, viewModel }: ReferenceHeroPromptProps) {
  const { content } = viewModel
  const suggestions = uniquePromptItems(content.suggestions)

  return (
    <PromptFrame content={content} variantId={variantId} className={`lumen-prompt-reference-hero ${className ?? ''}`}>
      <div className="lumen-prompt-reference-hero-content">
        <header className="lumen-prompt-reference-hero-heading">
          <h2>{content.title}</h2>
          <p>{content.description}</p>
        </header>
        {content.composer ? (
          <PromptComposer
            composer={content.composer}
            onDraftChange={viewModel.onDraftChange}
            onRemoveAttachment={viewModel.onRemoveAttachment}
            onAction={onAction}
          />
        ) : null}
        <div className="lumen-prompt-reference-suggestions" data-hbar-app-ui-region="suggestions">
          {suggestions.map((suggestion) => {
            const Icon = suggestionIcons[suggestion.icon]
            return (
              <button
                key={suggestion.id}
                type="button"
                data-hbar-app-ui-action="suggestion-select"
                data-suggestion-id={suggestion.id}
                onClick={() => viewModel.onSuggestionSelect?.(suggestion.id)}
              >
                <Icon aria-hidden="true" className="lumen-prompt-reference-icon" />
                {suggestion.label}
              </button>
            )
          })}
        </div>
      </div>
    </PromptFrame>
  )
}

export default ReferenceHeroPrompt
