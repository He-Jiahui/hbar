'use client'

import * as React from 'react'
import { Gauge, Mic } from 'lucide-react'
import { PromptChoiceMenu, PromptComposer, PromptFrame, uniquePromptItems } from './primitives'
import type { LumenPromptReferenceViewProps, LumenPromptRichReferenceContent } from './reference-content'

export function ReferenceRichPrompt({
  variantId,
  className,
  viewModel,
  onAction,
}: LumenPromptReferenceViewProps<LumenPromptRichReferenceContent>): React.ReactElement {
  const { content } = viewModel
  const id = React.useId()
  const commands = uniquePromptItems(content.commands)
  const showCommands = Boolean(content.composer?.draft.startsWith('/') && commands.length)
  return (
    <PromptFrame content={content} variantId={variantId} className={className}>
      {content.composer ? (
        <PromptComposer
          composer={content.composer}
          onDraftChange={viewModel.onDraftChange}
          onRemoveAttachment={viewModel.onRemoveAttachment}
          onAction={onAction}
          expanded={showCommands}
          listboxId={id}
        >
          <PromptChoiceMenu
            choices={content.models}
            selectedId={content.modelId}
            label={content.labels.model}
            onSelect={viewModel.onModelChange}
          />
          <span className="lumen-prompt-reference-toolbar-tail">
            <PromptChoiceMenu
              choices={content.efforts}
              selectedId={content.effortId}
              label={content.labels.effort}
              onSelect={viewModel.onEffortChange}
              icon={<Gauge aria-hidden="true" className="lumen-prompt-reference-icon" />}
              showLabel={false}
            />
          </span>
          <button
            type="button"
            aria-label={content.labels.voice}
            title={content.labels.voice}
            onClick={() => onAction?.({ actionId: 'voice-request' })}
          >
            <Mic aria-hidden="true" className="lumen-prompt-reference-icon" />
          </button>
        </PromptComposer>
      ) : null}
      {showCommands ? (
        <div id={id} role="listbox" aria-label={content.labels.commands} className="lumen-prompt-reference-picker">
          {commands.map((command) => (
            <button
              type="button"
              role="option"
              aria-selected={false}
              key={command.id}
              onClick={() => viewModel.onCommandSelect?.(command.id)}
            >
              {command.label}
            </button>
          ))}
        </div>
      ) : null}
    </PromptFrame>
  )
}
export default ReferenceRichPrompt
