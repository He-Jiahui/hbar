'use client'

import { ReferenceComposer, ReferenceFrame, ReferenceMessages } from './primitives'
import type { LumenAiChatEmbeddedReferenceContent, LumenAiChatReferenceViewProps } from './reference-content'
import './reference-embedded.css'

export function ReferenceEmbeddedChat({
  variantId,
  className,
  onAction,
  viewModel,
}: LumenAiChatReferenceViewProps<LumenAiChatEmbeddedReferenceContent>) {
  const { content } = viewModel

  return (
    <ReferenceFrame
      content={content}
      variantId={variantId}
      className={`lumen-ai-chat-reference-embedded ${className ?? ''}`}
    >
      <header className="lumen-ai-chat-reference-header lumen-ai-chat-reference-embedded-header">
        <h1>{content.title}</h1>
        {content.subtitle ? <span className="lumen-ai-chat-reference-embedded-status">{content.subtitle}</span> : null}
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

export default ReferenceEmbeddedChat
