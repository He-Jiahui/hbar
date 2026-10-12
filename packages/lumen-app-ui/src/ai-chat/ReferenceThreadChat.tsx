import * as React from 'react'
import type { LumenAiChatReferenceViewProps, LumenAiChatThreadReferenceContent } from './reference-content'
import { ReferenceComposer, ReferenceFrame, ReferenceMessages } from './primitives'

export function ReferenceThreadChat({
  viewModel,
  variantId,
  className,
  onAction,
}: LumenAiChatReferenceViewProps<LumenAiChatThreadReferenceContent>): React.ReactElement {
  const { content, onDraftChange, onRemoveAttachment } = viewModel
  return (
    <ReferenceFrame content={content} variantId={variantId} className={className}>
      <header className="lumen-ai-chat-reference-header">
        <h1>{content.title}</h1>
        <small>{content.subtitle}</small>
      </header>
      <ReferenceMessages content={content} onAction={onAction} />
      {content.composer ? (
        <ReferenceComposer
          composer={content.composer}
          onDraftChange={onDraftChange}
          onRemoveAttachment={onRemoveAttachment}
          onAction={onAction}
        />
      ) : null}
    </ReferenceFrame>
  )
}
export default ReferenceThreadChat
