'use client'

import * as React from 'react'
import { ReferenceComposer, ReferenceFrame, ReferenceMessages, uniqueReferenceItems } from './primitives'
import type { LumenAiChatAgentsReferenceContent, LumenAiChatReferenceViewProps } from './reference-content'
import './reference-agents.css'

function ActivityList({ content }: { readonly content: LumenAiChatAgentsReferenceContent }) {
  const activity = uniqueReferenceItems(content.activity)
  if (activity.length === 0) {
    return <p className="lumen-ai-chat-reference-agents-empty">{content.labels.empty}</p>
  }

  return (
    <ol className="lumen-ai-chat-reference-agents-activity-list">
      {activity.map((item) => (
        <li key={item.id} data-hbar-app-ui-item-id={item.id}>
          <div className="lumen-ai-chat-reference-agents-activity-heading">
            <strong>{item.label}</strong>
            <span>{item.status}</span>
          </div>
          {item.detail ? <p>{item.detail}</p> : null}
        </li>
      ))}
    </ol>
  )
}

export function ReferenceAgentsChat({
  variantId,
  className,
  viewModel,
  onAction,
}: LumenAiChatReferenceViewProps<LumenAiChatAgentsReferenceContent>) {
  const activityHeadingId = React.useId()
  const { content } = viewModel

  return (
    <ReferenceFrame
      content={content}
      variantId={variantId}
      className={`lumen-ai-chat-reference-agents ${className ?? ''}`}
    >
      <header className="lumen-ai-chat-reference-header lumen-ai-chat-reference-agents-header">
        <h1>{content.title}</h1>
        {content.subtitle ? <span>{content.subtitle}</span> : null}
      </header>
      <div className="lumen-ai-chat-reference-agents-layout">
        <section className="lumen-ai-chat-reference-agents-conversation">
          <ReferenceMessages content={content} onAction={onAction} onSourceSelect={viewModel.onSourceSelect} />
          <details
            className="lumen-ai-chat-reference-agents-activity-disclosure"
            data-hbar-app-ui-region="activity-details"
          >
            <summary>{content.activityTitle}</summary>
            <ActivityList content={content} />
          </details>
          {content.composer ? (
            <ReferenceComposer
              composer={content.composer}
              onDraftChange={viewModel.onDraftChange}
              onRemoveAttachment={viewModel.onRemoveAttachment}
              onAction={onAction}
            />
          ) : null}
        </section>
        <aside
          className="lumen-ai-chat-reference-agents-activity"
          aria-labelledby={activityHeadingId}
          data-hbar-app-ui-region="activity"
        >
          <h2 id={activityHeadingId}>{content.activityTitle}</h2>
          <ActivityList content={content} />
        </aside>
      </div>
    </ReferenceFrame>
  )
}

export default ReferenceAgentsChat
