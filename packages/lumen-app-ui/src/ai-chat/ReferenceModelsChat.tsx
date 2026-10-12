import { Sparkles } from 'lucide-react'
import type { LumenAiChatReferenceViewProps, LumenAiChatModelsReferenceContent } from './reference-content'
import {
  uniqueReferenceItems,
  ReferenceComposer,
  ReferenceFrame,
  ReferenceMessages,
  ReferenceModelMenu,
} from './primitives'
import './reference-models.css'

export function ReferenceModelsChat({
  viewModel,
  variantId,
  className,
  onAction,
}: LumenAiChatReferenceViewProps<LumenAiChatModelsReferenceContent>) {
  const { content } = viewModel
  const models = uniqueReferenceItems(content.models)
  const selectedModelId = models.find((model) => model.id === content.selectedModelId)?.id ?? models[0]?.id ?? ''
  const selectedModel = models.find((model) => model.id === selectedModelId)
  return (
    <ReferenceFrame
      content={content}
      variantId={variantId}
      className={`lumen-ai-chat-reference-models ${className ?? ''}`}
    >
      <header className="lumen-ai-chat-reference-header lumen-ai-chat-models-header">
        <h1>{content.title}</h1>
        {selectedModel ? <small>{content.modelSubtitle(selectedModelId)}</small> : null}
      </header>
      <ReferenceMessages content={content} onAction={onAction} assistantGlyph />
      {content.composer ? (
        <ReferenceComposer
          composer={content.composer}
          onDraftChange={viewModel.onDraftChange}
          onRemoveAttachment={viewModel.onRemoveAttachment}
          onAction={onAction}
        >
          <div className="lumen-ai-chat-model-trigger">
            <Sparkles aria-hidden="true" className="lumen-ai-chat-reference-icon" />
            <ReferenceModelMenu
              choices={content.models}
              selectedId={selectedModelId}
              label={content.modelLabel}
              onSelect={viewModel.onModelChange}
              anchor="above"
            />
          </div>
        </ReferenceComposer>
      ) : null}
      {selectedModel ? <p className="lumen-ai-chat-model-disclaimer">{content.disclaimer(selectedModelId)}</p> : null}
    </ReferenceFrame>
  )
}
export default ReferenceModelsChat
