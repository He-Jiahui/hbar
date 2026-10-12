'use client'

import type { LumenPromptModesReferenceContent, LumenPromptReferenceViewProps } from './reference-content'
import { PromptChoiceMenu, PromptComposer, PromptFrame, uniquePromptItems } from './primitives'
import './reference-modes.css'

function ReferenceModesPrompt({
  viewModel,
  variantId,
  className,
  onAction,
}: LumenPromptReferenceViewProps<LumenPromptModesReferenceContent>) {
  const { content } = viewModel
  const modes = uniquePromptItems(content.modes)
  const environments = uniquePromptItems(content.environments)
  const models = uniquePromptItems(content.models)
  const modeId = modes.some((mode) => mode.id === content.modeId) ? content.modeId : (modes[0]?.id ?? '')
  const environmentId = environments.some((item) => item.id === content.environmentId)
    ? content.environmentId
    : (environments[0]?.id ?? '')
  const modelId = models.some((item) => item.id === content.modelId) ? content.modelId : (models[0]?.id ?? '')
  const action = viewModel.onAction ?? onAction

  const changeMode = (id: string) => {
    viewModel.onModeChange?.(id)
    action?.({ actionId: 'mode', value: id })
  }
  return (
    <PromptFrame content={content} variantId={variantId} className={`lumen-prompt-reference-modes ${className ?? ''}`}>
      {content.composer ? (
        <PromptComposer
          composer={content.composer}
          onDraftChange={viewModel.onDraftChange}
          onRemoveAttachment={viewModel.onRemoveAttachment}
          onAction={action}
          sendOnEnter
        >
          <div className="lumen-prompt-mode-tabs" role="group" aria-label={content.labels.modes}>
            {modes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                aria-pressed={mode.id === modeId}
                data-mode-id={mode.id}
                data-hbar-app-ui-action="mode-select"
                data-hbar-app-ui-target={mode.id}
                onClick={() => changeMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <PromptChoiceMenu
            choices={content.environments}
            selectedId={environmentId}
            label={(name) => content.labels.environment(name)}
            onSelect={(id) => {
              viewModel.onEnvironmentChange?.(id)
              action?.({ actionId: 'environment', value: id })
            }}
            anchor="above"
          />
          <PromptChoiceMenu
            choices={content.models}
            selectedId={modelId}
            label={(name) => content.labels.model(name)}
            onSelect={(id) => {
              viewModel.onModelChange?.(id)
              action?.({ actionId: 'model', value: id })
            }}
            anchor="above"
          />
        </PromptComposer>
      ) : null}
      {modeId ? <p className="lumen-prompt-mode-description">{content.modeDescription(modeId)}</p> : null}
      {content.hints.length ? (
        <div className="lumen-prompt-mode-hints" role="group" aria-label={content.labels.modes}>
          {uniquePromptItems(content.hints).map((hint) => (
            <span key={hint.id}>
              <kbd>{hint.key}</kbd>
              <span>{hint.description}</span>
            </span>
          ))}
        </div>
      ) : null}
    </PromptFrame>
  )
}

export default ReferenceModesPrompt
